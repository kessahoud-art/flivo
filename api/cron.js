const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const APP_URL = process.env.APP_URL || 'https://flivo.vercel.app'

// ── Relances upgrade ──────────────────────────
const RELANCES_UPGRADE = [
  { step:1, delai:30*60*1000,        msg:(b)=>`Bonjour ${b} 👋\n\nTon compte Flivo est bloqué.\nEnvoie 3 500 FCFA sur Wave/Orange/MTN : +229 96 83 07 75\nPuis envoie le reçu ici 🙏\n\n${APP_URL}/upgrade.html` },
  { step:2, delai:2*60*60*1000,      msg:(b)=>`Bonjour ${b} 👋\n\nTon compte est toujours bloqué depuis 2h.\n📦 Tes clients t'attendent.\n\nPour débloquer : 3 500 FCFA → +229 96 83 07 75\nActivé en 30 min dès réception.\n\n${APP_URL}/upgrade.html` },
  { step:3, delai:24*60*60*1000,     msg:(b)=>`Bonjour ${b} 👋\n\nCela fait 24h que ton compte est bloqué.\n\nPlan Pro : 3 500 FCFA/mois\n→ +229 96 83 07 75\nEnvoie le reçu ici après paiement.\n\n${APP_URL}/upgrade.html` },
  { step:4, delai:48*60*60*1000,     msg:(b)=>`Bonjour ${b} 👋\n\nDernière relance. On est là si tu as des questions.\n\n✅ Plan Pro : 3 500 FCFA/mois\nPaiement : +229 96 83 07 75\n\n${APP_URL}/upgrade.html` }
]

// ── Relances expiration ───────────────────────
const RELANCES_EXPIRE = [
  { step:1, delai:1*60*60*1000,      msg:(b)=>`Bonjour ${b} 👋\n\nTon plan Pro Flivo vient d'expirer.\n🚫 Tu ne peux plus créer de livraisons.\n\nRenouvelle : 3 500 FCFA → +229 96 83 07 75\n\n${APP_URL}/upgrade.html` },
  { step:2, delai:24*60*60*1000,     msg:(b)=>`Bonjour ${b} 👋\n\nTon plan est expiré depuis 24h.\nTes données sont en sécurité.\n\nRenouvelle maintenant → +229 96 83 07 75\n\n${APP_URL}/upgrade.html` },
  { step:3, delai:3*24*60*60*1000,   msg:(b)=>`Bonjour ${b} 👋\n\nPlan expiré depuis 3 jours.\nNe perds pas tes clients.\n\n3 500 FCFA → +229 96 83 07 75\nActivé en 30 min 🙏\n\n${APP_URL}/upgrade.html` }
]

// ── Handler principal ─────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const secret = req.query.secret || req.headers['x-cron-secret']
  if (secret !== process.env.WEBHOOK_SECRET) return res.status(403).json({ error: 'Non autorisé' })

  const type = req.query.type || 'all'
  const now  = new Date()
  const logs = []

  // ══ 1. RELANCES UPGRADE ══════════════════════
  if (type === 'relance' || type === 'all') {
    const { data: vendeurs } = await supabase
      .from('vendeurs')
      .select('id, email, nom_boutique, phone, relance_step, last_whatsapp_click_at')
      .eq('upgrade_intent', true)
      .neq('payment_status', 'confirmed')
      .not('last_whatsapp_click_at', 'is', null)

    for (const v of (vendeurs || [])) {
      const ecoulé    = now - new Date(v.last_whatsapp_click_at)
      const stepActuel = v.relance_step || 0
      const prochaine  = RELANCES_UPGRADE.find(r => r.step === stepActuel + 1)
      if (!prochaine || ecoulé < prochaine.delai) continue

      const boutique = v.nom_boutique || v.email
      const message  = prochaine.msg(boutique)
      const lienWA   = v.phone ? `https://wa.me/${v.phone.replace(/\D/g,'')}?text=${encodeURIComponent(message)}` : null

      await supabase.from('vendeurs').update({ relance_step: prochaine.step }).eq('id', v.id)
      await supabase.from('relance_logs').insert({ vendeur_id:v.id, type:'upgrade', step:prochaine.step, message:`Relance upgrade ${prochaine.step}/4 — ${boutique}` })

      logs.push({ type:'upgrade', vendeur:v.email, step:prochaine.step, lien_wa:lienWA })
      console.log(`📨 Relance upgrade step ${prochaine.step} — ${v.email}`)
    }
  }

  // ══ 2. EXPIRATION PRO ════════════════════════
  if (type === 'expire' || type === 'all') {
    // Détecter plans expirés
    const { data: expiresNow } = await supabase
      .from('vendeurs')
      .select('id, email, nom_boutique, phone, pro_expires_at')
      .eq('plan', 'pro')
      .lt('pro_expires_at', now.toISOString())

    for (const v of (expiresNow || [])) {
      await supabase.from('vendeurs').update({
        plan:'blocked', free_blocked:true,
        blocked_at:now.toISOString(),
        relance_expire_step:0, last_expire_relance_at:null
      }).eq('id', v.id)
      await supabase.from('relance_logs').insert({ vendeur_id:v.id, type:'expiration', step:0, message:`Plan Pro expiré → blocked` })
      logs.push({ type:'expiration', vendeur:v.email })
      console.log(`⏰ Plan Pro expiré → blocked — ${v.email}`)
    }

    // Relances expiration
    const { data: bloques } = await supabase
      .from('vendeurs')
      .select('id, email, nom_boutique, phone, blocked_at, relance_expire_step')
      .eq('plan', 'blocked')
      .not('blocked_at', 'is', null)

    for (const v of (bloques || [])) {
      const ecoulé    = now - new Date(v.blocked_at)
      const stepActuel = v.relance_expire_step || 0
      const prochaine  = RELANCES_EXPIRE.find(r => r.step === stepActuel + 1)
      if (!prochaine || ecoulé < prochaine.delai) continue

      const boutique = v.nom_boutique || v.email
      const message  = prochaine.msg(boutique)
      const lienWA   = v.phone ? `https://wa.me/${v.phone.replace(/\D/g,'')}?text=${encodeURIComponent(message)}` : null

      await supabase.from('vendeurs').update({ relance_expire_step:prochaine.step, last_expire_relance_at:now.toISOString() }).eq('id', v.id)
      await supabase.from('relance_logs').insert({ vendeur_id:v.id, type:'expire_relance', step:prochaine.step, message:`Relance expiration ${prochaine.step}/3 — ${boutique}` })

      logs.push({ type:'relance_expire', vendeur:v.email, step:prochaine.step, lien_wa:lienWA })
    }
  }

  // ══ 3. RESET QUOTA MENSUEL ═══════════════════
  if (type === 'reset') {
    await supabase.from('vendeurs').update({ deliveries_count:0 }).neq('id', '00000000-0000-0000-0000-000000000000')
    logs.push({ type:'reset', message:'Compteurs livraisons remis à 0' })
    console.log(`🔄 Reset quota mensuel effectué`)
  }

  return res.status(200).json({ success:true, timestamp:now.toISOString(), actions:logs.length, logs })
}
