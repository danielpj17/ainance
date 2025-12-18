'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Plus, Trash2, Edit2, Check, X, AlertTriangle } from 'lucide-react'

interface PaperAccount {
  id: string
  account_name: string
  alpaca_account_number: string | null
  created_at: string
  updated_at: string
}

interface PaperAccountManagerProps {
  onAccountsChange?: () => void
}

export default function PaperAccountManager({ onAccountsChange }: PaperAccountManagerProps) {
  const [accounts, setAccounts] = useState<PaperAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(false)
  
  const [formData, setFormData] = useState({
    account_name: '',
    alpaca_api_key: '',
    alpaca_api_secret: ''
  })

  useEffect(() => {
    // Check if in demo mode
    const checkDemoMode = async () => {
      try {
        const response = await fetch('/api/paper-accounts')
        const result = await response.json()
        // We're allowing demo mode now, just note it for UI purposes
        setIsDemoMode(false) // Not restricting anymore
      } catch (error) {
        console.error('Error checking demo mode:', error)
      }
    }
    
    checkDemoMode()
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/paper-accounts')
      const result = await response.json()
      
      if (result.success) {
        setAccounts(result.data || [])
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to load accounts' })
      }
    } catch (error) {
      console.error('Error loading paper accounts:', error)
      setMessage({ type: 'error', text: 'Failed to load accounts' })
    } finally {
      setLoading(false)
    }
  }

  const handleAddAccount = async () => {
    if (!formData.account_name || !formData.alpaca_api_key || !formData.alpaca_api_secret) {
      setMessage({ type: 'error', text: 'Please fill in all fields' })
      return
    }

    try {
      setSaving(true)
      setMessage(null)
      
      const response = await fetch('/api/paper-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      const result = await response.json()
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Paper trading account added successfully!' })
        setFormData({ account_name: '', alpaca_api_key: '', alpaca_api_secret: '' })
        setShowAddForm(false)
        await loadAccounts()
        onAccountsChange?.()
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to add account' })
      }
    } catch (error) {
      console.error('Error adding paper account:', error)
      setMessage({ type: 'error', text: 'Failed to add account' })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateAccount = async (accountId: string) => {
    if (!formData.account_name) {
      setMessage({ type: 'error', text: 'Account name is required' })
      return
    }

    try {
      setSaving(true)
      setMessage(null)
      
      const updateData: any = { account_name: formData.account_name }
      
      // Only include API keys if they were provided
      if (formData.alpaca_api_key && formData.alpaca_api_secret) {
        updateData.alpaca_api_key = formData.alpaca_api_key
        updateData.alpaca_api_secret = formData.alpaca_api_secret
      }
      
      const response = await fetch(`/api/paper-accounts?id=${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })
      
      const result = await response.json()
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Account updated successfully!' })
        setFormData({ account_name: '', alpaca_api_key: '', alpaca_api_secret: '' })
        setEditingId(null)
        await loadAccounts()
        onAccountsChange?.()
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to update account' })
      }
    } catch (error) {
      console.error('Error updating paper account:', error)
      setMessage({ type: 'error', text: 'Failed to update account' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async (accountId: string) => {
    try {
      setSaving(true)
      setMessage(null)
      
      const response = await fetch(`/api/paper-accounts?id=${accountId}`, {
        method: 'DELETE'
      })
      
      const result = await response.json()
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Account deleted successfully!' })
        setDeleteConfirm(null)
        await loadAccounts()
        onAccountsChange?.()
      } else {
        if (result.trade_count) {
          setMessage({ 
            type: 'error', 
            text: `Cannot delete account with ${result.trade_count} existing trades. Please archive or migrate trades first.` 
          })
        } else {
          setMessage({ type: 'error', text: result.error || 'Failed to delete account' })
        }
      }
    } catch (error) {
      console.error('Error deleting paper account:', error)
      setMessage({ type: 'error', text: 'Failed to delete account' })
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (account: PaperAccount) => {
    setEditingId(account.id)
    setFormData({
      account_name: account.account_name,
      alpaca_api_key: '',
      alpaca_api_secret: ''
    })
    setShowAddForm(false)
    setMessage(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFormData({ account_name: '', alpaca_api_key: '', alpaca_api_secret: '' })
    setMessage(null)
  }

  const cancelAdd = () => {
    setShowAddForm(false)
    setFormData({ account_name: '', alpaca_api_key: '', alpaca_api_secret: '' })
    setMessage(null)
  }

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Paper Trading Accounts</CardTitle>
            <CardDescription>
              Manage multiple paper trading accounts with different strategies
            </CardDescription>
          </div>
          {!showAddForm && !editingId && (
            <Button 
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Account
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <Alert className={message.type === 'error' ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'border-green-500 bg-green-50 dark:bg-green-950'}>
            {message.type === 'error' && <AlertTriangle className="h-4 w-4" />}
            <AlertDescription className={message.type === 'error' ? 'text-red-700 dark:text-red-200' : 'text-green-700 dark:text-green-200'}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        {/* Add Account Form */}
        {showAddForm && (
          <div className="border border-blue-500/30 rounded-lg p-4 space-y-4 bg-blue-500/5">
            <h3 className="font-semibold text-lg">Add New Paper Trading Account</h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="new-account-name">Account Name *</Label>
                <Input
                  id="new-account-name"
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  placeholder="e.g., Strategy A, Test Account"
                />
              </div>
              <div>
                <Label htmlFor="new-api-key">Alpaca API Key *</Label>
                <Input
                  id="new-api-key"
                  type="password"
                  value={formData.alpaca_api_key}
                  onChange={(e) => setFormData({ ...formData, alpaca_api_key: e.target.value })}
                  placeholder="PK..."
                />
              </div>
              <div>
                <Label htmlFor="new-api-secret">Alpaca API Secret *</Label>
                <Input
                  id="new-api-secret"
                  type="password"
                  value={formData.alpaca_api_secret}
                  onChange={(e) => setFormData({ ...formData, alpaca_api_secret: e.target.value })}
                  placeholder="Secret key"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddAccount} disabled={saving} className="flex-1">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Adding...</> : 'Add Account'}
              </Button>
              <Button onClick={cancelAdd} variant="outline" disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Accounts List */}
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No paper trading accounts yet. Add one to get started!
            </div>
          ) : (
            accounts.map((account) => (
              <div key={account.id} className="border border-gray-700 rounded-lg p-4 space-y-3">
                {editingId === account.id ? (
                  // Edit Mode
                  <>
                    <div className="space-y-3">
                      <div>
                        <Label>Account Name *</Label>
                        <Input
                          value={formData.account_name}
                          onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>New API Key (leave blank to keep current)</Label>
                        <Input
                          type="password"
                          value={formData.alpaca_api_key}
                          onChange={(e) => setFormData({ ...formData, alpaca_api_key: e.target.value })}
                          placeholder="PK..."
                        />
                      </div>
                      <div>
                        <Label>New API Secret (leave blank to keep current)</Label>
                        <Input
                          type="password"
                          value={formData.alpaca_api_secret}
                          onChange={(e) => setFormData({ ...formData, alpaca_api_secret: e.target.value })}
                          placeholder="Secret key"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => handleUpdateAccount(account.id)} 
                        disabled={saving}
                        className="flex-1"
                      >
                        {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : <><Check className="h-4 w-4 mr-2" /> Save</>}
                      </Button>
                      <Button onClick={cancelEdit} variant="outline" disabled={saving}>
                        <X className="h-4 w-4 mr-2" /> Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  // View Mode
                  <>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{account.account_name}</h3>
                        {account.alpaca_account_number && (
                          <p className="text-sm text-gray-400">Account: {account.alpaca_account_number}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Added: {new Date(account.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => startEdit(account)}
                          variant="outline"
                          size="sm"
                          disabled={saving || showAddForm}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {deleteConfirm === account.id ? (
                          <>
                            <Button
                              onClick={() => handleDeleteAccount(account.id)}
                              variant="destructive"
                              size="sm"
                              disabled={saving}
                            >
                              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            </Button>
                            <Button
                              onClick={() => setDeleteConfirm(null)}
                              variant="outline"
                              size="sm"
                              disabled={saving}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            onClick={() => setDeleteConfirm(account.id)}
                            variant="outline"
                            size="sm"
                            disabled={saving || showAddForm || editingId !== null}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {deleteConfirm === account.id && (
                      <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-yellow-700 dark:text-yellow-200">
                          Are you sure you want to delete this account? This action cannot be undone.
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

