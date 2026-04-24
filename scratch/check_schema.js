require('dotenv').config({ path: './backend/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function checkSchema() {
    // Try to insert a dummy record with scheduled_time to see if it fails
    const { data, error } = await supabase
        .from('tasks')
        .insert({
            title: 'Test Schema',
            skill: 'test',
            source: 'test',
            status: 'pending',
            scheduled_time: new Date().toISOString()
        })
        .select();

    if (error) {
        console.error("Error inserting:", error);
    } else {
        console.log("Insert successful, columns exist or are ignored:", data);
    }
}

checkSchema();
