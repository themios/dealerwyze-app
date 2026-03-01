'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  displayName: string
}

export default function ProfileEditForm({ displayName }: Props) {
  const [name, setName] = useState(displayName)
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState('')

  async function handleNameSave(e: React.FormEvent) {
    e.preventDefault()
    setNameSaving(true)
    setNameSaved(false)
    setNameError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setNameError('Not authenticated')
      setNameSaving(false)
      return
    }
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim() })
      .eq('id', user.id)
    setNameSaving(false)
    if (error) {
      setNameError(error.message)
    } else {
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 3000)
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault()
    setPwSaved(false)
    setPwError('')
    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match')
      return
    }
    setPwSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwSaving(false)
    if (error) {
      setPwError(error.message)
    } else {
      setPwSaved(true)
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPwSaved(false), 3000)
    }
  }

  return (
    <div className="space-y-3">
      {/* Display name */}
      <form onSubmit={handleNameSave} className="border rounded-lg bg-card p-4 space-y-3">
        <p className="text-sm font-medium">Display Name</p>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full text-sm border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Your name"
          required
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={nameSaving}
            className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {nameSaving ? 'Saving…' : 'Save Name'}
          </button>
          {nameSaved && <span className="text-xs text-green-600">Saved</span>}
          {nameError && <span className="text-xs text-destructive">{nameError}</span>}
        </div>
      </form>

      {/* Change password */}
      <form onSubmit={handlePasswordSave} className="border rounded-lg bg-card p-4 space-y-3">
        <p className="text-sm font-medium">Change Password</p>
        <input
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          className="w-full text-sm border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="New password"
          autoComplete="new-password"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          className="w-full text-sm border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Confirm new password"
          autoComplete="new-password"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pwSaving}
            className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {pwSaving ? 'Updating…' : 'Update Password'}
          </button>
          {pwSaved && <span className="text-xs text-green-600">Password updated</span>}
          {pwError && <span className="text-xs text-destructive">{pwError}</span>}
        </div>
      </form>
    </div>
  )
}
