const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const { data, error, count } = await supabase
    .from('help_articles')
    .select('*', { count: 'exact' })
    .limit(5)
  
  if (error) {
    console.error('ERROR:', error.message, error.details)
    process.exit(1)
  }
  
  console.log(`Found ${count} articles total`)
  console.log('Sample articles:')
  data.forEach(a => {
    console.log(`  - ${a.slug}: "${a.question}" (vertical: ${a.vertical})`)
  })
}

check()
