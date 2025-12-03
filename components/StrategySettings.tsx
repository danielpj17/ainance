'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertTriangle } from 'lucide-react'

interface UserSettings {
  strategy: 'cash' | '25k_plus'
  account_type: 'cash' | 'margin'
  confidence_threshold?: number
  sell_confidence_threshold?: number
  max_exposure?: number  // Max total exposure % (default 90)
}

interface PerformanceMetrics {
  winRate: number
  avgWin: number
  avgLoss: number
  monthlyReturn: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  totalPnL: number
}

interface StrategySettingsProps {
  mode: 'paper' | 'live'
}

export default function StrategySettings({ mode }: StrategySettingsProps) {
  const [settings, setSettings] = useState<UserSettings>({
    strategy: 'cash',
    account_type: 'cash',
    max_exposure: 90,  // Default 90%
    sell_confidence_threshold: 0.50  // Default 50%
  })

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null)
  const [loadingMetrics, setLoadingMetrics] = useState(false)

  // Load settings and performance metrics on component mount
  useEffect(() => {
    loadSettings()
    loadPerformanceMetrics()
  }, [])
  
  const loadPerformanceMetrics = async () => {
    setLoadingMetrics(true)
    try {
      const response = await fetch('/api/settings/performance')
      const result = await response.json()
      
      if (result.success && result.data) {
        setPerformanceMetrics(result.data)
      }
    } catch (error) {
      console.error('Error loading performance metrics:', error)
    } finally {
      setLoadingMetrics(false)
    }
  }

  const loadSettings = async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch('/api/settings', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      })
      const result = await response.json()
      
      if (result.success && result.data) {
        setSettings({
          ...result.data,
          confidence_threshold: result.data.confidence_threshold ?? 0.55,
          sell_confidence_threshold: result.data.sell_confidence_threshold ?? 0.50,
          max_exposure: result.data.max_exposure ?? 90
        })
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
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
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

  if (loading) {
    return (
      <Card className="glass-card">
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
    <Card className="glass-card">
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

        {/* Strategy Selection and Account Type - Side by Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <Select 
              value={settings.account_type} 
              onValueChange={(value: 'cash' | 'margin') => updateSetting('account_type', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">
                  <div>
                    <div className="font-medium">Cash Account</div>
                    <div className="text-xs text-muted-foreground">
                      No borrowing, T+2 settlement
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="margin">
                  <div>
                    <div className="font-medium">Margin Account</div>
                    <div className="text-xs text-muted-foreground">
                      Allows borrowing, watch for PDT rules
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Margin Warning */}
        {showMarginWarning && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Warning: Margin account with cash strategy may trigger PDT (Pattern Day Trader) rules
            </AlertDescription>
          </Alert>
        )}

        {/* Confidence Thresholds - Side by Side */}
        <div className="border-t pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Buy Confidence Threshold */}
            <div className="space-y-2">
              <Label htmlFor="confidence_threshold">
                ML Buy Confidence Threshold ({(settings.confidence_threshold ?? 0.55) * 100}%)
              </Label>
              <div className="space-y-2">
                <Input
                  id="confidence_threshold"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={settings.confidence_threshold ?? 0.55}
                  onChange={(e) => updateSetting('confidence_threshold', Number(e.target.value))}
                  placeholder="0.55"
                />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Minimum confidence (0.0-1.0) required for ML BUY signals to execute trades.</p>
                  <p><strong>Lower threshold (0.45-0.50):</strong> More trades, higher risk</p>
                  <p><strong>Higher threshold (0.55-0.70):</strong> Fewer trades, lower risk</p>
                  <p><strong>Recommended:</strong> Start at 0.55 (55%) and adjust based on performance</p>
                </div>
              </div>
            </div>

            {/* Sell Confidence Threshold */}
            <div className="space-y-2">
              <Label htmlFor="sell_confidence_threshold">
                ML Sell Confidence Threshold ({(settings.sell_confidence_threshold ?? 0.50) * 100}%)
              </Label>
              <div className="space-y-2">
                <Input
                  id="sell_confidence_threshold"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={settings.sell_confidence_threshold ?? 0.50}
                  onChange={(e) => updateSetting('sell_confidence_threshold', Number(e.target.value))}
                  placeholder="0.50"
                />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Minimum confidence (0.0-1.0) required for ML SELL signals to exit positions.</p>
                  <p><strong>Lower threshold (0.40-0.50):</strong> Exit positions more easily, better capital protection</p>
                  <p><strong>Higher threshold (0.50-0.60):</strong> Hold positions longer, wait for stronger sell signals</p>
                  <p><strong>Recommended:</strong> Set 5-10% lower than buy threshold (e.g., 0.50 if buy is 0.55)</p>
                  <p><strong>Note:</strong> In high-risk markets, this threshold automatically decreases further to protect capital.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Max Exposure */}
        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="max_exposure">
            Max Total Capital Exposure ({settings.max_exposure ?? 90}%)
          </Label>
          <div className="space-y-2">
            <Input
              id="max_exposure"
              type="number"
              step="1"
              min="50"
              max="100"
              value={settings.max_exposure ?? 90}
              onChange={(e) => updateSetting('max_exposure', Number(e.target.value))}
              placeholder="90"
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Maximum percentage of capital that can be deployed across all positions.</p>
              <p><strong>Lower (70-80%):</strong> More conservative, keeps cash reserves</p>
              <p><strong>Higher (90-95%):</strong> More aggressive, maximizes capital usage</p>
              <p><strong>Note:</strong> High-confidence opportunities (&gt;75%) may trigger forced sells of low-confidence positions (&lt;65%) to make room.</p>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Trading Performance</h3>
            <Button 
              variant="outline" 
              size="sm"
              onClick={loadPerformanceMetrics}
              disabled={loadingMetrics}
            >
              {loadingMetrics ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-2" />
                  Loading...
                </>
              ) : (
                'Refresh'
              )}
            </Button>
          </div>
          
          {performanceMetrics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold">
                  {performanceMetrics.winRate.toFixed(1)}%
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Avg Win</p>
                <p className="text-2xl font-bold text-green-500">
                  ${performanceMetrics.avgWin.toFixed(2)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Avg Loss</p>
                <p className="text-2xl font-bold text-red-500">
                  ${performanceMetrics.avgLoss.toFixed(2)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Monthly Return</p>
                <p className={`text-2xl font-bold ${performanceMetrics.monthlyReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {performanceMetrics.monthlyReturn.toFixed(2)}%
                </p>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {loadingMetrics ? 'Loading performance data...' : 'No trading data available yet. Start trading to see your performance metrics.'}
            </div>
          )}
          
          {performanceMetrics && performanceMetrics.totalTrades > 0 && (
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              <p><strong>Total Trades:</strong> {performanceMetrics.totalTrades} ({performanceMetrics.winningTrades} wins, {performanceMetrics.losingTrades} losses)</p>
              <p><strong>Total P&L:</strong> ${performanceMetrics.totalPnL.toFixed(2)}</p>
              <p><strong>Goal Progress:</strong> {performanceMetrics.monthlyReturn >= 5 ? '✅' : '⏳'} {performanceMetrics.monthlyReturn.toFixed(2)}% / 5.00% monthly target</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button 
            onClick={() => saveSettings(true)}
            disabled={saving}
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
          <p><strong>$25k+ Rules:</strong> No trade limits, higher frequency trading</p>
          <p><strong>Margin Account:</strong> Allows borrowing, but watch for PDT rules</p>
        </div>
      </CardContent>
    </Card>
  )
}
