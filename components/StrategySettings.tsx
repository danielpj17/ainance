'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertTriangle } from 'lucide-react'

interface UserSettings {
  strategy: 'cash' | '25k_plus'
  account_type: 'cash' | 'margin'
  max_trade_size: number
  daily_loss_limit: number
  take_profit: number
  stop_loss: number
}

interface StrategySettingsProps {
  mode: 'paper' | 'live'
}

export default function StrategySettings({ mode }: StrategySettingsProps) {
  const [settings, setSettings] = useState<UserSettings>({
    strategy: 'cash',
    account_type: 'cash',
    max_trade_size: 5000,
    daily_loss_limit: -2,
    take_profit: 0.5,
    stop_loss: 0.3
  })

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)

  // Load settings on component mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/settings')
      const result = await response.json()
      
      if (result.success && result.data) {
        setSettings(result.data)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
      setMessage({ type: 'error', text: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async (startStrategy = false) => {
    setSaving(true)
    setMessage(null)
    
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      })

      const result = await response.json()
      
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: startStrategy 
            ? 'Strategy started successfully!' 
            : 'Settings saved successfully!' 
        })
        
        if (startStrategy) {
          console.log('Strategy started with settings:', settings)
        }
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save settings' })
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: keyof UserSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  // Validation warnings
  const showMarginWarning = settings.account_type === 'margin' && settings.strategy === 'cash'
  const showTradeSizeWarning = settings.strategy === '25k_plus' && settings.max_trade_size < 5000

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Settings...
          </CardTitle>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy Settings - {mode === 'paper' ? 'Paper Trading' : 'Live Trading'}</CardTitle>
        <CardDescription>
          Configure your trading strategy and risk management parameters
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* Strategy Selection */}
        <div className="space-y-2">
          <Label htmlFor="strategy">Trading Strategy</Label>
          <Select 
            value={settings.strategy} 
            onValueChange={(value: 'cash' | '25k_plus') => updateSetting('strategy', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">
                <div>
                  <div className="font-medium">Cash Trading</div>
                  <div className="text-xs text-muted-foreground">
                    Under $25k: Max 3 trades/5 days, T+2 settlement
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="25k_plus">
                <div>
                  <div className="font-medium">$25k+ Rules</div>
                  <div className="text-xs text-muted-foreground">
                    Higher frequency, larger positions
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Account Type */}
        <div className="space-y-2">
          <Label htmlFor="account_type">Account Type</Label>
          <div className="flex items-center space-x-2">
            <Switch
              id="account_type"
              checked={settings.account_type === 'margin'}
              onCheckedChange={(checked) => 
                updateSetting('account_type', checked ? 'margin' : 'cash')
              }
            />
            <Label htmlFor="account_type" className="text-sm">
              {settings.account_type === 'margin' ? 'Margin Account' : 'Cash Account'}
            </Label>
          </div>
          {showMarginWarning && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Warning: Margin account with cash strategy may trigger PDT (Pattern Day Trader) rules
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Risk Management Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="max_trade_size">Max Trade Size ($)</Label>
            <Input
              id="max_trade_size"
              type="number"
              value={settings.max_trade_size}
              onChange={(e) => updateSetting('max_trade_size', Number(e.target.value))}
              placeholder="5000"
            />
            {showTradeSizeWarning && (
              <p className="text-xs text-destructive">
                $25k+ strategy requires max trade size ≥ $5,000
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="daily_loss_limit">Daily Loss Limit (%)</Label>
            <Input
              id="daily_loss_limit"
              type="number"
              value={settings.daily_loss_limit}
              onChange={(e) => updateSetting('daily_loss_limit', Number(e.target.value))}
              placeholder="-2"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="take_profit">Take Profit (%)</Label>
            <Input
              id="take_profit"
              type="number"
              step="0.1"
              value={settings.take_profit}
              onChange={(e) => updateSetting('take_profit', Number(e.target.value))}
              placeholder="0.5"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stop_loss">Stop Loss (%)</Label>
            <Input
              id="stop_loss"
              type="number"
              step="0.1"
              value={settings.stop_loss}
              onChange={(e) => updateSetting('stop_loss', Number(e.target.value))}
              placeholder="0.3"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button 
            onClick={() => saveSettings(true)}
            disabled={saving || showTradeSizeWarning}
            className="flex-1"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Starting...
              </>
            ) : (
              'Start Strategy'
            )}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => saveSettings(false)}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </div>

        {/* Strategy Info */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Cash Trading:</strong> Max 3 trades per 5-day period, T+2 settlement</p>
          <p><strong>$25k+ Rules:</strong> No trade limits, requires min $5k trade size</p>
          <p><strong>Margin Account:</strong> Allows borrowing, but watch for PDT rules</p>
        </div>
      </CardContent>
    </Card>
  )
}
