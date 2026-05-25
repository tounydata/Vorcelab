import { useVLStore } from '../store/vlStore'
import { supabase } from '../lib/supabase'

export default function ProfilePage() {
  const user = useVLStore((s) => s.user)

  return (
    <>
      <div className="clabel" style={{ marginBottom: '1rem', fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
        PROFIL
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="clabel">Compte</div>
        <div className="fg">
          <span className="fl">Email</span>
          <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>
            {user?.email?.toLowerCase()}
          </span>
        </div>
        <div className="fg">
          <span className="fl">ID</span>
          <span className="mlabel" style={{ color: 'var(--vl-text-3)', fontSize: 10 }}>
            {user?.id}
          </span>
        </div>
      </div>

      <button
        className="hbtn"
        onClick={() => supabase.auth.signOut()}
      >
        Se déconnecter
      </button>
    </>
  )
}
