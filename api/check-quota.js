const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ═══════════════════════════════════════════════
//  DÉFINITION DES PLANS FLIVO
// ═══════════════════════════════════════════════
const PLANS = {
  free: {
    nom:                 'Free',
    livraisons_limite:   20,
    livreurs_limite:     3,
    employes_limite:     1,
    stats:               false,
    export_csv:          false,
    support:             false,
    historique_jours:    30,
  },
  pro: {
    nom:                 'Pro',
    livraisons_limite:   999999,
    livreurs_limite:     999999,
    employes_limite:     2,
    stats:               true,
    export_csv:          true,
    support:             true,
    historique_jours:    365,
  },
  business: {
    nom:                 'Business',
    livraisons_limite:   999999,
    livreurs_limite:     999999,
    employes_limite:     5,
    stats:               true,
    export_csv:          true,
    support:             true,
    historique_jours:    365,
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' })
  }
  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token invalide' })

  const { data: vendeur, error } = await supabase
    .from('vendeurs')
    .select('plan, livraisons_ce_mois, plan_expire_le')
    .eq('id', user.id)
    .single()

  if (error || !vendeur) return res.status(404).json({ error: 'Vendeur introuvable' })

  // ── Vérifier expiration du plan ──────────────
  const maintenant = new Date()
  let planActuel = vendeur.plan || 'free'

  if (planActuel !== 'free' && vendeur.plan_expire_le) {
    const expiration = new Date(vendeur.plan_expire_le)
    if (expiration < maintenant) {
      // Plan expiré → repasser en free automatiquement
      await supabase
        .from('vendeurs')
        .update({ plan: 'free' })
        .eq('id', user.id)
      planActuel = 'free'
    }
  }

  const config   = PLANS[planActuel] || PLANS.free
  const quota    = vendeur.livraisons_ce_mois || 0
  const bloque   = quota >= config.livraisons_limite
  const restant  = Math.max(0, config.livraisons_limite - quota)

  return res.status(200).json({
    plan:               planActuel,
    config,
    livraisons_ce_mois: quota,
    limite:             config.livraisons_limite,
    restant,
    bloque,
    plan_expire_le:     vendeur.plan_expire_le || null,
    expire_bientot:     vendeur.plan_expire_le
      ? (new Date(vendeur.plan_expire_le) - maintenant) < 5 * 24 * 60 * 60 * 1000
      : false
  })
}
