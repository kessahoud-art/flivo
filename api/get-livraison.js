const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { code } = req.query
  if (!code) return res.status(400).json({ error: 'Code manquant' })

  const { data, error } = await supabase
    .from('livraisons')
    .select('*')
    .eq('code', code)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Livraison introuvable' })

  return res.status(200).json(data)
}
