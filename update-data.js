import fetch from 'node-fetch';

// CONFIGURATION VARIABLES
const SUPABASE_URL = 'https://pbeputavvfmbdvbdgmur.supabase.co'; // Paste your Supabase URL
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiZXB1dGF2dmZtYmR2YmRnbXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjU1NDYsImV4cCI6MjEwNjUwMTU0Nn0.PJUnHBy53vEn13ur_EQuFy6CighO1LeuVxZ76vh3z-w'; // Paste your long anon public key
const API_KEY = 'b0629a41db62468e82fd3c09d57f9308'; // Paste your Football-Data token

async function syncCompetitionData(compCode, compName) {
  console.log(`[SYNC] Starting fetch for ${compName} (${compCode})...`);
  
  // 1. Fixed URL with clean string handling to completely prevent variable typos
  const apiUrl = 'https://football-data.org' + compCode + '/standings';
  
  const apiResponse = await fetch(apiUrl, {
    headers: { 'X-Auth-Token': API_KEY }
  });
  
  if (!apiResponse.ok) {
    throw new Error(`API returned error status ${apiResponse.status} for ${compName}`);
  }
  
  const apiData = await apiResponse.json();
  console.log(`[SYNC] Successfully downloaded ${compName} data.`);

  // 2. Format the layout arrays safely
  const rawTable = apiData.standings && apiData.standings[0] && apiData.standings[0].table ? apiData.standings[0].table : [];

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

  // 3. Save directly into Supabase rows filtered by name
  console.log(`[DATABASE] Pushing ${compName} matrix payload to Supabase...`);
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
    // Run the sync engine for the Premier League (PL)
    await syncCompetitionData('PL', 'Premier League');
    
    console.log("[THROTTLE] Cooling down for 10 seconds to avoid free API limit blocks...");
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Run the sync engine for La Liga (PD)
    await syncCompetitionData('PD', 'La Liga');

    console.log("[COMPLETE] Everything updated perfectly on autopilot!");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ CRITICAL SYNC ENGINE FAILURE:");
    console.error(err.message);
    process.exit(1);
  }
}

runMainSync();

