const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const WA_NUM  = process.env.ADMIN_WA || '22996830775'
const APP_URL = process.env.APP_URL  || 'https://flivo.vercel.app'

// ── Délais entre relances ─────────────────────
const RELANCES = [
  {
    step:    1,
    delai:   30 * 60 * 1000, // 30 minutes
    message: (b) => `Bonjour ${b} 👋\n\nTu as cliqué pour passer au Pro mais ton paiement n'a pas encore été confirmé.\n\nTon compte est toujours bloqué.\n\nEnvoie 3 500 FCFA sur Wave/Orange Money : +229 96 83 07 75\nPuis envoie le reçu ici.\n\nFlivo → ${APP_URL}/upgrade.html`
  },
  {
    step:    2,
    delai:   2 * 60 * 60 * 1000, // 2 heures
    message: (b) => `Bonjour ${b} 👋\n\nTon compte Flivo est toujours bloqué.\n\n📦 Tes livraisons t'attendent.\n\nPour débloquer : envoie 3 500 FCFA sur :\nWave / Orange Money / MTN MoMo\n+229 96 83 07 75\n\nDès réception, ton plan est activé en 30 min.\n\n${APP_URL}/upgrade.html`
  },
  {
    step:    3,
    delai:   24 * 60 * 60 * 1000, // 24 heures
    message: (b) => `Bonjour ${b} 👋\n\nCela fait 24h que ton compte Flivo est bloqué.\n\n😔 Tu ne peux plus créer de livraisons.\n\nPour continuer :\n→ 3 500 FCFA/mois sur +229 96 83 07 75\n→ Envoie ton reçu sur ce numéro\n→ Plan activé en moins de 30 min\n\nOn est là pour t'aider 🙏\n${APP_URL}/upgrade.html`
  },
  {
    step:    4,
    delai:   48 * 60 * 60 * 1000, // 48 heures
    message: (b) => `Bonjour ${b} 👋\n\nDernière relance de notre part.\n\n✅ Plan Pro Flivo : 3 500 FCFA/mois seulement\n✅ Livraisons illimitées\n✅ Support direct\n\nPaiement sur : +229 96 83 07 75\n\nSi tu as des questions, réponds à ce message.\nOn est là 🙏\n\n${APP_URL}/upgrade.html`
  }
]

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  // Sécurité
  const secret = req.query.secret || req.headers['x-cron-secret']
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Non autorisé' })
  }

  const maintenant = new Date()
  let totalRelances = 0
  const logs = []

  try {
    // Trouver tous les vendeurs avec upgrade_intent = true et payment non confirmé
    const { data: vendeurs, error } = await supabase
      .from('vendeurs')
      .select('id, email, nom_boutique, phone, relance_step, last_whatsapp_click_at')
      .eq('upgrade_intent', true)
      .neq('payment_status', 'confirmed')
      .not('last_whatsapp_click_at', 'is', null)

    if (error) throw error

    for (const v of (vendeurs || [])) {
      const clicAt    = new Date(v.last_whatsapp_click_at)
      const ecoulé    = maintenant - clicAt
      const stepActuel = v.relance_step || 0

      // Trouver la prochaine relance à envoyer
      const prochaineRelance = RELANCES.find(r => r.step === stepActuel + 1)
      if (!prochaineRelance) continue // Toutes les relances envoyées

      // Vérifier si le délai est atteint
      if (ecoulé < prochaineRelance.delai) continue

      // Générer le message
      const boutique = v.nom_boutique || v.email
      const message  = prochaineRelance.message(boutique)
      const lienWA   = v.phone
        ? `https://wa.me/${v.phone.replace(/\D/g,'')}?text=${encodeURIComponent(message)}`
        : null

      // Mettre à jour le step
      await supabase.from('vendeurs').update({
        relance_step: prochaineRelance.step
      }).eq('id', v.id)

      // Logger la relance
      await supabase.from('relance_logs').insert({
        vendeur_id: v.id,
        type:       'upgrade',
        step:       prochaineRelance.step,
        message:    `Relance ${prochaineRelance.step}/4 envoyée — ${boutique}`
      })

      logs.push({
        vendeur:  v.email,
        boutique,
        step:     prochaineRelance.step,
        lien_wa:  lienWA
      })

      totalRelances++
      console.log(`📨 Relance upgrade step ${prochaineRelance.step} — ${v.email}`)
    }

    return res.status(200).json({
      success:        true,
      timestamp:      maintenant.toISOString(),
      relances_sent:  totalRelances,
      details:        logs
    })

  } catch (err) {
    console.error('Erreur relance-cron:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
