import fetch from 'node-fetch';

// CONFIGURATION VARIABLES
const SUPABASE_URL = 'b0629a41db62468e82fd3c09d57f9308'; // Ensure NO '/rest/v1/' at the end
const SUPABASE_KEY = 'https://pbeputavvfmbdvbdgmur.supabase.co'; // Your long anon public token
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiZXB1dGF2dmZtYmR2YmRnbXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjU1NDYsImV4cCI6MjEwNjUwMTU0Nn0.PJUnHBy53vEn13ur_EQuFy6CighO1LeuVxZ76vh3z-w'
; // Your Football-Data.org token

async function syncCompetitionData(compCode, compName) {
  console.log(`[SYNC] Starting fetch for ${compName} (${compCode})...`);
  
  // 1. Fetch live data from the free Football API
  const apiResponse = await fetch(`https://football-data.org{compCode}/standings`, {
    headers: { 'X-Auth-Token': API_KEY }
  });
  
  if (!apiResponse.ok) {
    throw new Error(`API returned error status ${apiResponse.status} for ${compName}`);
  }
  
  const apiData = await apiResponse.json();
  console.log(`[SYNC] Successfully downloaded ${compName} data.`);

  // 2. Format the payload into clean, universal components for our HTML site
  const formattedPayload = {
    updated: new Date().toISOString(),
    standings: apiData.standings?.[0]?.table?.map(t => ({
      position: t.position,
      team: t.team.name,
      crest: t.team.crest,
      played: t.playedGames,
      won: t.won,
      draw: t.draw,
      lost: t.lost,
      gd: t.goalDifference,
      points: t.points,
      form: t.form
    })) || [],
    matches: [] // Ready to hold future matches
  };

  // 3. Save into Supabase Row 1 (Updating the single cloud payload cell)
  console.log(`[DATABASE] Pushing ${compName} clean matrix payload to Supabase...`);
  const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/football_live_data?competition_name=eq.${encodeURIComponent(compName)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
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
    
    // To comply with the free tier's 10 requests/min throttle limit, wait 10 seconds before hitting La Liga
    console.log("[THROTTLE] Cooling down for 10 seconds to avoid free API limit blocks...");
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Run the sync engine for La Liga (PD)
    await syncCompetitionData('PD', 'La Liga');

    console.log("[COMPLETE] Everything updated perfectly on autopilot!");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ CRITICAL SYNC ENGINE FAILURE:");
    console.error(err.message);
    process.exit(1); // Forces an explicit system exit showing real error codes
  }
}

runMainSync();
