'use client'

import { useState, useEffect, useRef } from 'react'
import { authFetch } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { X, Loader2, Save, Settings } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

interface AccountStrategyModalProps {
  accountId: string
  accountName: string
  isOpen: boolean
  onClose: () => void
  onSave?: () => void
}

interface StrategySettings {
  account_type: 'cash' | 'margin'
  confidence_threshold: number
  sell_confidence_threshold: number
  max_exposure: number
  // Updated to include LLM options
  algorithm_type: 'ml_model' | 'rule_based_simple' | 'rule_based_advanced' | 'gemini_analyst' | 'llama_technical' | 'consensus_combined'
  is_short_selling_enabled: boolean
}

export default function AccountStrategyModal({ accountId, accountName, isOpen, onClose, onSave }: AccountStrategyModalProps) {
  const [settings, setSettings] = useState<StrategySettings>({
    account_type: 'cash',
    confidence_threshold: 0.65,
    sell_confidence_threshold: 0.50,
    max_exposure: 90,
    algorithm_type: 'ml_model',
    is_short_selling_enabled: false
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && accountId) {
      loadSettings()
    }
  }, [isOpen, accountId])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      console.log('📂 Loading strategy settings for account:', accountId)

      const response = await fetch(`/api/account-strategy?account_id=${accountId}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined
      })

      const result = await response.json()
      console.log('📂 Loaded strategy settings:', result)

      if (result.success && result.settings) {
        const loadedSettings: StrategySettings = {
          ...result.settings,
          algorithm_type: result.settings.algorithm_type || 'ml_model',
          is_short_selling_enabled: result.settings.is_short_selling_enabled ?? false
        }
        if (loadedSettings.account_type === 'cash') {
          loadedSettings.is_short_selling_enabled = false
        }
        setSettings(loadedSettings)
        console.log('✅ Settings applied to modal:', loadedSettings)
      } else {
        console.warn('⚠️ No settings found, using defaults')
      }
    } catch (error) {
      console.error('❌ Error loading settings:', error)
      setMessage({ type: 'error', text: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage(null)

      const settingsToSave: StrategySettings = settings.account_type === 'cash'
        ? { ...settings, is_short_selling_enabled: false }
        : settings

      console.log('💾 Saving strategy settings:', {
        account_id: accountId,
        settings: settingsToSave
      })

      const response = await authFetch('/api/account-strategy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_id: accountId,
          settings: settingsToSave
        })
      })

      const result = await response.json()
      console.log('💾 Save response:', result)

      if (result.success) {
        setMessage({ type: 'success', text: 'Settings saved! Restart the bot to apply changes.' })
        console.log('✅ Strategy settings saved successfully')
        if (onSave) {
          setTimeout(() => {
            onSave()
            onClose()
          }, 2000) // Give user time to read the message
        }
      } else {
        console.error('❌ Failed to save settings:', result.error)
        setMessage({ type: 'error', text: result.error || 'Failed to save settings' })
      }
    } catch (error) {
      console.error('❌ Error saving settings:', error)
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  // Helper function to get description for selected algorithm
  const getAlgoDescription = (type: string) => {
    switch (type) {
      case 'ml_model': return 'Uses trained Random Forest model for predictions';
      case 'rule_based_simple': return 'Uses RSI, MACD, and EMA indicators with simple rules';
      case 'rule_based_advanced': return 'Uses advanced multi-indicator scoring system';
      case 'gemini_analyst': return 'Gemini 1.5 Flash: Reads news & technicals (Fundamental Focus)';
      case 'llama_technical': return 'Llama 3.3: Pure math & pattern recognition (Speed Focus)';
      case 'consensus_combined': return 'High Safety: Requires agreement from both Gemini and Llama';
      default: return '';
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        ref={modalRef}
        className="bg-[#1a1d2e] rounded-lg border border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[#1a1d2e] border-b border-gray-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Strategy Settings
            </h2>
            <p className="text-gray-400 text-sm mt-1">{accountName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Account Type */}
              <div>
                <Label htmlFor="account_type" className="text-white">Account Type</Label>
                <Select
                  value={settings.account_type}
                  onValueChange={(value: any) => setSettings({
                    ...settings,
                    account_type: value,
                    is_short_selling_enabled: value === 'cash' ? false : settings.is_short_selling_enabled
                  })}
                >
                  <SelectTrigger id="account_type" className="bg-[#252838] border-gray-700 text-white mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent container={modalRef.current}>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="margin">Margin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">
                  {settings.account_type === 'cash' 
                    ? 'Trade with settled funds only' 
                    : 'Trade with borrowed funds (2x-4x leverage)'}
                </p>
              </div>

              {/* Short Selling */}
              <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-[#252838] p-4">
                <div>
                  <Label htmlFor="short_selling" className="text-white">Enable Short Selling</Label>
                  <p className="text-xs text-gray-400 mt-1">
                    {settings.account_type === 'cash'
                      ? 'Short selling is disabled for cash accounts'
                      : 'Allow opening short positions on margin accounts'}
                  </p>
                </div>
                <Switch
                  id="short_selling"
                  checked={settings.is_short_selling_enabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, is_short_selling_enabled: checked })}
                  disabled={settings.account_type === 'cash'}
                />
              </div>

              {/* Algorithm Type */}
              <div>
                <Label htmlFor="algorithm_type" className="text-white">Trading Algorithm</Label>
                <Select value={settings.algorithm_type} onValueChange={(value: any) => setSettings({ ...settings, algorithm_type: value })}>
                  <SelectTrigger id="algorithm_type" className="bg-[#252838] border-gray-700 text-white mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent container={modalRef.current}>
                    <SelectItem value="ml_model">ML Model (Random Forest)</SelectItem>
                    <SelectItem value="rule_based_simple">Rule-Based (Simple)</SelectItem>
                    <SelectItem value="rule_based_advanced">Rule-Based (Advanced)</SelectItem>
                    <SelectItem value="gemini_analyst">Gemini 1.5 Flash (Analyst)</SelectItem>
                    <SelectItem value="llama_technical">Llama 3.3 (Technical)</SelectItem>
                    <SelectItem value="consensus_combined">Consensus (Gemini + Llama)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">
                  {getAlgoDescription(settings.algorithm_type)}
                </p>
              </div>

              {/* Buy Confidence Threshold */}
              <div>
                <Label htmlFor="confidence" className="text-white">Buy Confidence Threshold</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Input
                    id="confidence"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.confidence_threshold}
                    onChange={(e) => setSettings({ ...settings, confidence_threshold: parseFloat(e.target.value) || 0 })}
                    className="bg-[#252838] border-gray-700 text-white"
                  />
                  <span className="text-white min-w-[60px]">{(settings.confidence_threshold * 100).toFixed(0)}%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Minimum confidence required to execute buy orders
                </p>
              </div>

              {/* Sell Confidence Threshold */}
              <div>
                <Label htmlFor="sell_confidence" className="text-white">Sell Confidence Threshold</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Input
                    id="sell_confidence"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.sell_confidence_threshold}
                    onChange={(e) => setSettings({ ...settings, sell_confidence_threshold: parseFloat(e.target.value) || 0 })}
                    className="bg-[#252838] border-gray-700 text-white"
                  />
                  <span className="text-white min-w-[60px]">{(settings.sell_confidence_threshold * 100).toFixed(0)}%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Minimum confidence required to execute sell orders
                </p>
              </div>

              {/* Max Exposure */}
              <div>
                <Label htmlFor="max_exposure" className="text-white">Maximum Portfolio Exposure</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Input
                    id="max_exposure"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={settings.max_exposure}
                    onChange={(e) => setSettings({ ...settings, max_exposure: parseInt(e.target.value) || 0 })}
                    className="bg-[#252838] border-gray-700 text-white"
                  />
                  <span className="text-white min-w-[60px]">{settings.max_exposure}%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Maximum percentage of buying power to use for trading
                </p>
              </div>

              {/* Message */}
              {message && (
                <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  {message.text}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-700">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={saving}
                  className="border-gray-600 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Settings
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}