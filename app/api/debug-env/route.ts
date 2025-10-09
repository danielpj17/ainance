import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export async function GET() {
  const cwd = process.cwd()
  const envPath = path.join(cwd, '.env.local')
  const envExists = fs.existsSync(envPath)
  let envStat: any = null
  let encodingInfo: any = null
  try {
    envStat = envExists ? fs.statSync(envPath) : null
    if (envExists) {
      const buf = fs.readFileSync(envPath)
      const hasUTF8BOM = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
      const hasUTF16LEBOM = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe
      const hasUTF16BEBOM = buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff
      // Heuristic: lots of 0x00 bytes suggests UTF-16
      let nullCount = 0
      const sampleLen = Math.min(buf.length, 200)
      for (let i = 0; i < sampleLen; i++) {
        if (buf[i] === 0x00) nullCount++
      }
      const likelyUTF16 = nullCount > sampleLen * 0.2
      encodingInfo = { hasUTF8BOM, hasUTF16LEBOM, hasUTF16BEBOM, likelyUTF16 }
    }
  } catch {}
  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
    NEXT_PUBLIC_SUPABASE_ANON_KEY_defined: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_URL: process.env.SUPABASE_URL || null,
    SUPABASE_SERVICE_ROLE_KEY_defined: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    cwd,
    envPath,
    envExists,
    envSize: envStat?.size ?? null,
    encodingInfo,
  })
}


