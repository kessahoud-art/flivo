const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// ─────────────────────────────────────────────────────────
//  reset-quota.js
//  Remet livraisons_ce_mois à 0 pour tous les vendeurs
//
//  COMMENT L'APPELER CHAQUE 1ER DU MOIS :
//
//  Option A — Manuellement (simple) :
//    Appelle https://flivo.vercel.app/api/reset-quota?secret=TON_SECRET
//    Le 1er de chaque mois depuis ton navigateur
//
//  Option B — Automatiquement via cron-job.org (gratuit) :
//    1. Va sur cron-job.org → créer un compte gratuit
//    2. Nouveau cron job :
//       URL → https://flivo.vercel.app/api/reset-quota?secret=TON_SECRET
//       Planification → 0 0 1 * * (1er du mois à minuit)
//    3. C'est tout — ça tourne tout seul
// ─────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  // Vérification sécurité — secret dans l'URL
  const { secret } = req.query
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Non autorisé' })
  }

  const maintenant = new Date()
  const mois       = maintenant.getMonth() + 1
  const annee      = maintenant.getFullYear()

  // Remettre tous les compteurs à 0
  const { data, error } = await supabase
    .from('vendeurs')
    .update({ livraisons_ce_mois: 0 })
    .neq('id', '00000000-0000-0000-0000-000000000000') // met à jour tous les vendeurs

  if (error) {
    console.error('Erreur reset quota :', error.message)
    return res.status(500).json({ error: 'Erreur reset', detail: error.message })
  }

  console.log(`✅ Reset quota effectué — ${mois}/${annee}`)
  return res.status(200).json({
    success: true,
    message: `Quotas remis à 0 pour ${mois}/${annee}`,
    timestamp: maintenant.toISOString()
  })
}
