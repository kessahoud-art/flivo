const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const PLANS_AVEC_EXPORT = ['pro', 'business']

function escapeCSV(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const STATUT_LABELS = { 0:'En attente', 1:'Prêt', 2:'En route', 3:'Livré', 4:'Échec' }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' })
  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token invalide' })

  // Vérifier le plan
  const { data: vendeur } = await supabase
    .from('vendeurs').select('plan, plan_expire_le').eq('id', user.id).single()

  const maintenant = new Date()
  const planOK = PLANS_AVEC_EXPORT.includes(vendeur?.plan) &&
    (!vendeur?.plan_expire_le || new Date(vendeur.plan_expire_le) > maintenant)

  if (!planOK) {
    return res.status(403).json({
      error: 'plan_insuffisant',
      message: 'L\'export CSV est disponible à partir du plan Pro.'
    })
  }

  // Récupérer les livraisons
  const { data: livraisons, error } = await supabase
    .from('livraisons').select('*')
    .eq('vendeur_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  // Générer CSV
  const entetes = ['Code','Date','Client','Tél. client','Adresse','Montant FCFA','Livreur','Tél. livreur','Statut','Mis à jour']
  const lignes = livraisons.map(l => [
    escapeCSV(l.code),
    escapeCSV(l.created_at ? new Date(l.created_at).toLocaleDateString('fr-FR') : ''),
    escapeCSV(l.client_nom),
    escapeCSV(l.client_phone),
    escapeCSV(l.adresse),
    escapeCSV(l.montant),
    escapeCSV(l.livreur_nom),
    escapeCSV(l.livreur_phone),
    escapeCSV(STATUT_LABELS[l.statut] || ''),
    escapeCSV(l.updated_at ? new Date(l.updated_at).toLocaleDateString('fr-FR') : ''),
  ].join(','))

  const csv = '\uFEFF' + [entetes.join(','), ...lignes].join('\n')
  const nom = `flivo-livraisons-${new Date().toISOString().split('T')[0]}.csv`

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`)
  return res.status(200).send(csv)
}
