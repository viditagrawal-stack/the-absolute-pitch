import fetch from 'node-fetch';

// CONFIGURATION VARIABLES (Preloaded with your valid keys)
const SUPABASE_URL = 'https://supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiZXB1dGF2dmZtYmR2YmRnbXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjU1NDYsImV4cCI6MjEwNjUwMTU0Nn0.PJUnHBy53vEn13ur_EQuFy6CighO1LeuVxZ76vh3z-w'; 
const API_KEY = 'b0629a41db62468e82fd3c09d57f9308'; 

async function syncCompetitionData(compCode, compName) {
  console.log(`[SYNC] Starting fetch for ${compName} (${compCode})...`);
  
  // 1. Build a clean URL path string pointing to the official endpoints
  const apiUrl = 'https://www.football-data.org' + compCode + '/standings';
  
  const apiResponse = await fetch(apiUrl, {
    headers: { 'X-Auth-Token': API_KEY }
  });
  
  if (!apiResponse.ok) {
    throw new Error(`API returned error status ${apiResponse.status} for ${compName}`);
  }
  
  const apiData = await apiResponse.json();
  console.log(`[SYNC] Successfully downloaded ${compName} data.`);

  // 2. Safe array extractor handling both standard league tables and tournament group arrays
  let rawTable = [];
  if (apiData.standings) {
    if (apiData.standings.table) {
      rawTable = apiData.standings.table;
    } else if (Array.isArray(apiData.standings) && apiData.standings[0] && apiData.standings[0].table) {
      rawTable = apiData.standings[0].table;
    } else if (apiData.standings.standings && Array.isArray(apiData.standings.standings) && apiData.standings.standings[0] && apiData.standings.standings[0].table) {
      rawTable = apiData.standings.standings[0].table;
    }
  }

  const formattedPayload = {
    updated: new Date().toISOString(),
    standings: rawTable.map(t => ({
      position: t.position,
      team: t.team ? t.team.name : 'Unknown',
      crest: t.team ? t.team.crest : '',
      played: t.playedGames || 0,
      won: t.won || 0,
      draw: t.draw || 0,
      lost: t.lost || 0,
      gd: t.goalDifference || 0,
      points: t.points || 0,
      form: t.form || ''
    })),
    matches: []
  };

  // 3. Update the records inside the Supabase cloud table rows using the filter
  console.log(`[DATABASE] Pushing ${compName} payload matrix into Supabase rows...`);
  const dbResponse = await fetch(SUPABASE_URL + '/rest/v1/football_live_data?competition_name=eq.' + encodeURIComponent(compName), {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      competition_name: compName,
      json_payload: formattedPayload
    })
  });

  if (!dbResponse.ok) {
    const textError = await dbResponse.text();
    throw new Error(`Database patch failed: ${dbResponse.status} - ${textError}`);
  }
  
  console.log(`[SUCCESS] Cloud sync complete for ${compName}!`);
}

async function runMainSync() {
  try {
    // Stage 1: Synchronize the English Premier League (PL)
    await syncCompetitionData('PL', 'Premier League');
    
    // Safety cooling pause to protect the free API tier request throttle limit rules
    console.log("[THROTTLE] Cooling down for 12 seconds to avoid limit errors...");
    await new Promise(resolve => setTimeout(resolve, 12000));
    
    // Stage 2: Synchronize La Liga (PD)
    await syncCompetitionData('PD', 'La Liga');

    // Safety cooling pause before triggering tournament updates
    console.log("[THROTTLE] Cooling down for 12 seconds to avoid limit errors...");
    await new Promise(resolve => setTimeout(resolve, 12000));

    // Stage 3: Synchronize the UEFA Champions League (CL)
    await syncCompetitionData('CL', 'Champions League');

    console.log("[COMPLETE] Premier League, La Liga, and UCL updated perfectly on autopilot!");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ CRITICAL SYNC ENGINE FAILURE:");
    console.error(err.message);
    process.exit(1);
  }
}

runMainSync();
