const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { code, statut } = req.body

  if (!code || statut === undefined) return res.status(400).json({ error: 'Code ou statut manquant' })
  if (![0,1,2,3,4].includes(Number(statut))) return res.status(400).json({ error: 'Statut invalide' })

  const { data, error } = await supabase
    .from('livraisons')
    .update({ statut: Number(statut), updated_at: new Date().toISOString() })
    .eq('code', code)
    .select()
    .single()

  if (error || !data) return res.status(500).json({ error: 'Erreur mise à jour', detail: error?.message })

  return res.status(200).json({ success: true, livraison: data })
}
