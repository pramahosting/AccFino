import React, { createContext, useContext, useState } from 'react'
import { login as apiLogin } from '../lib/api.js'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('af_user')) } catch { return null }
  })
  const [loading, setLoading] = useState(false)

  const login = async (email, password) => {
    setLoading(true)
    try {
      const { data } = await apiLogin(email.trim(), password.trim())
      const roles = (data.roles || []).map(r => String(r).trim().toLowerCase())
      const u = { ...data, is_admin: roles.includes('admin') }
      setUser(u)
      localStorage.setItem('af_user', JSON.stringify(u))
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
