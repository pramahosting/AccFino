import React, { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, getMyPlan, licenceMyModules, verifySession } from '../lib/api.js'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('af_user')) } catch { return null }
  })
  const [loading, setLoading] = useState(false)

  // The user object above is restored straight from localStorage with no
  // server round-trip. If the database was ever reset/reseeded since this
  // browser last logged in, that cached user_id may no longer exist --
  // silently causing foreign-key errors deep in unrelated features (e.g.
  // creating an invoice) instead of a clear "please log in again". Check
  // once on mount and clear the stale session if the user is gone.
  useEffect(() => {
    if (!user?.id) return
    verifySession(user.id).catch(err => {
      if (err.response?.status === 404) {
        setUser(null)
        localStorage.removeItem('af_user')
      }
      // any other error (network blip, etc.) is not treated as invalid --
      // don't log someone out just because one check failed to reach the server
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = async (email, password) => {
    setLoading(true)
    try {
      const { data } = await apiLogin(email.trim(), password.trim())
      const roles = (data.roles || []).map(r => String(r).trim().toLowerCase())
      const u = {
        ...data,
        roles:    roles,
        is_admin: roles.includes('admin'),
      }

      // Fetch current plan and modules on login so they're always fresh
      try {
        const [planRes, modsRes] = await Promise.all([
          getMyPlan(data.id),
          licenceMyModules(data.id),
        ])
        u.plan      = planRes.data        // { plan_id, licence_type, end_date, modules }
        u.modules   = modsRes.data?.modules || []
      } catch { /* non-fatal */ }

      setUser(u)
      localStorage.setItem('af_user', JSON.stringify(u))
      // Notify Layout to re-apply module permissions
      window.dispatchEvent(new Event('accfino:modules-changed'))
      return { ok: true, user: u }
    } catch (e) {
      return { ok: false, error: e.response?.data?.detail || 'Invalid credentials' }
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('af_user')
  }

  return <Ctx.Provider value={{ user, login, logout, loading }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
