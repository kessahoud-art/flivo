const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const APP_URL = process.env.APP_URL || 'https://flivo.vercel.app'

// ── Relances après expiration ─────────────────
const RELANCES_EXPIRE = [
  {
    step:    1,
    delai:   1 * 60 * 60 * 1000, // 1 heure
    message: (b) => `Bonjour ${b} 👋\n\nTon plan Pro Flivo vient d'expirer.\n\n🚫 Tu ne peux plus créer de nouvelles livraisons.\n\nRenouvelle maintenant pour 3 500 FCFA/mois :\nWave / Orange Money / MTN : +229 96 83 07 75\n\nEnvoie ton reçu ici dès le paiement.\n\n${APP_URL}/upgrade.html`
  },
  {
    step:    2,
    delai:   24 * 60 * 60 * 1000, // 24 heures
    message: (b) => `Bonjour ${b} 👋\n\nCela fait 24h que ton plan Pro Flivo a expiré.\n\n📦 Tes livraisons sont toujours bloquées.\n\nTes données sont en sécurité — tu retrouveras tout à la réactivation.\n\nRenouvelle : 3 500 FCFA → +229 96 83 07 75\n\n${APP_URL}/upgrade.html`
  },
  {
    step:    3,
    delai:   3 * 24 * 60 * 60 * 1000, // 3 jours
    message: (b) => `Bonjour ${b} 👋\n\nTon plan Flivo est expiré depuis 3 jours.\n\n😔 Tes clients ne peuvent plus recevoir de lien de suivi.\n\nNe perds pas tes clients à cause de ça.\n\nRenouvelle maintenant :\n→ 3 500 FCFA / mois\n→ +229 96 83 07 75\n→ Activé en 30 minutes\n\nOn est là 🙏\n${APP_URL}/upgrade.html`
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
  let expirations  = 0
  let relances     = 0
  const logs       = []

  try {

    // ── 1. Détecter les plans Pro expirés ────────
    const { data: expiresNow } = await supabase
      .from('vendeurs')
      .select('id, email, nom_boutique, phone, pro_expires_at')
      .eq('plan', 'pro')
      .lt('pro_expires_at', maintenant.toISOString())

    for (const v of (expiresNow || [])) {
      // Bloquer — JAMAIS revenir en free
      await supabase.from('vendeurs').update({
        plan:                   'blocked',
        free_blocked:           true,
        blocked_at:             maintenant.toISOString(),
        relance_expire_step:    0,
        last_expire_relance_at: null
      }).eq('id', v.id)

      await supabase.from('relance_logs').insert({
        vendeur_id: v.id,
        type:       'expiration',
        step:       0,
        message:    `Plan Pro expiré → bloqué. Pro était jusqu'au ${new Date(v.pro_expires_at).toLocaleDateString('fr-FR')}`
      })

      console.log(`⏰ Plan Pro expiré → blocked — ${v.email}`)
      expirations++
      logs.push({ type: 'expiration', vendeur: v.email })
    }

    // ── 2. Relances pour les plans blocked ───────
    const { data: bloques } = await supabase
      .from('vendeurs')
      .select('id, email, nom_boutique, phone, blocked_at, relance_expire_step, last_expire_relance_at')
      .eq('plan', 'blocked')
      .not('blocked_at', 'is', null)

    for (const v of (bloques || [])) {
      const blockedAt  = new Date(v.blocked_at)
      const ecoulé     = maintenant - blockedAt
      const stepActuel = v.relance_expire_step || 0

      const prochaineRelance = RELANCES_EXPIRE.find(r => r.step === stepActuel + 1)
      if (!prochaineRelance) continue

      if (ecoulé < prochaineRelance.delai) continue

      const boutique = v.nom_boutique || v.email
      const message  = prochaineRelance.message(boutique)
      const lienWA   = v.phone
        ? `https://wa.me/${v.phone.replace(/\D/g,'')}?text=${encodeURIComponent(message)}`
        : null

      await supabase.from('vendeurs').update({
        relance_expire_step:    prochaineRelance.step,
        last_expire_relance_at: maintenant.toISOString()
      }).eq('id', v.id)

      await supabase.from('relance_logs').insert({
        vendeur_id: v.id,
        type:       'expire_relance',
        step:       prochaineRelance.step,
        message:    `Relance expiration ${prochaineRelance.step}/3 — ${boutique}`
      })

      logs.push({
        type:     'relance_expire',
        vendeur:  v.email,
        boutique,
        step:     prochaineRelance.step,
        lien_wa:  lienWA
      })

      console.log(`📨 Relance expiration step ${prochaineRelance.step} — ${v.email}`)
      relances++
    }

    return res.status(200).json({
      success:      true,
      timestamp:    maintenant.toISOString(),
      expirations,
      relances,
      details:      logs
    })

  } catch (err) {
    console.error('Erreur expire-cron:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
