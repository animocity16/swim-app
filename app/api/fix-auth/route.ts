import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Step 1: Find the user by email
  const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers()
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  const user = users.users.find(u => u.email === 'julian.loh@gmail.com')
  if (!user) return NextResponse.json({ error: 'User not found in this project' }, { status: 404 })

  // Step 2: Set a password using the Admin API
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: 'Natrix2026!',   // ← change this to whatever you want
    email_confirm: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, userId: data.user.id, email: data.user.email })
}