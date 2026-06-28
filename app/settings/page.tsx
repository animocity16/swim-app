"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { replayTutorial } from "@/app/components/TutorialOverlay";
import SplashMediaUpload from "@/app/components/SplashMediaUpload";
import { applyTheme, applyFontSize, FONT_SIZES, type FontSizeId } from "@/app/components/ThemeProvider";
import Link from "next/link";

const APP_VERSION = "1.0.0";

// Only this account sees the admin tools card below.
const ADMIN_USER_ID = "9156c797-d133-4a7f-aa93-03688f2bdfd1";

const FEATURE_REQUESTS = [
  "AI nutrition guide", "Meet calendar", "Apple Watch support",
  "Team / club dashboard", "Relay tracking", "Compare with teammates",
  "Export to PDF / spreadsheet", "Push notifications", "Other",
];

// ─── Font colour presets ───────────────────────────────────────────────────────

const FONT_COLOURS = [
  { id: "pink",     label: "Pink",  hex: "#FF6EB4", dark: false },
  { id: "white",    label: "White", hex: "#FFFFFF",  dark: false },
  { id: "babyblue", label: "Sky",   hex: "#89CFF0",  dark: false },
  { id: "red",      label: "Red",   hex: "#FF4444",  dark: true  },
  { id: "black",    label: "Black", hex: "#1A1A1A",  dark: true  },
  { id: "blue",     label: "Blue",  hex: "#3B82F6",  dark: true  },
] as const;
type FontColourId = (typeof FONT_COLOURS)[number]["id"];

// ─── Background gradient ──────────────────────────────────────────────────────

const HUES = [0,30,60,90,120,150,180,210,240,270,300,330,360];
const BG_GRADIENT     = `linear-gradient(to right, ${HUES.map(h=>`hsl(${h},60%,14%)`).join(", ")})`;
const AVATAR_GRADIENT = `linear-gradient(to right, ${HUES.map(h=>`hsl(${h},65%,38%)`).join(", ")})`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getContrastText(hex: string): string {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return (0.299*r + 0.587*g + 0.114*b)/255 > 0.5 ? "#1a1a1a" : "#ffffff";
}

function applyCustomBgInline(hue: number) {
  const bg=`hsl(${hue},60%,12%)`,dark=`hsl(${hue},63%,14%)`,mid=`hsl(${hue},58%,17%)`;
  const light=`hsl(${hue},55%,22%)`,light2=`hsl(${hue},52%,25%)`,light3=`hsl(${hue},57%,19%)`;
  const navBg=`hsla(${hue},60%,12%,0.84)`;
  const root=document.documentElement;
  root.style.setProperty("--theme-bg",bg); root.style.setProperty("--theme-dark",dark);
  root.style.setProperty("--theme-mid",mid); root.style.setProperty("--theme-light",light);
  root.style.setProperty("--theme-light2",light2); root.style.setProperty("--theme-light3",light3);
  root.style.setProperty("--theme-nav-bg",navBg);
  let el=document.getElementById("natrix-theme") as HTMLStyleElement|null;
  if(!el){el=document.createElement("style");el.id="natrix-theme";document.head.appendChild(el);}
  el.textContent=`body{background-color:${bg}!important;}body::before{background:radial-gradient(ellipse 60% 50% at 15% 25%,${light} 0%,transparent 65%),radial-gradient(ellipse 50% 60% at 85% 55%,${dark} 0%,transparent 60%),radial-gradient(ellipse 70% 40% at 50% 85%,${light3} 0%,transparent 65%),radial-gradient(ellipse 40% 30% at 70% 15%,${light2} 0%,transparent 55%),linear-gradient(160deg,${bg} 0%,${mid} 40%,${bg} 100%)!important;}nav.fixed{background:${navBg}!important;}select.input option{background:${bg}!important;}`;
  try{localStorage.setItem("natrix_custom_bg_hue",String(hue));}catch{}
}

function applyFontColourInline(hex: string) {
  try{localStorage.setItem("natrix_font_colour",hex);}catch{}
  document.documentElement.style.setProperty("--natrix-font-colour",hex);
  let el=document.getElementById("natrix-font-colour") as HTMLStyleElement|null;
  if(!el){el=document.createElement("style");el.id="natrix-font-colour";document.head.appendChild(el);}
  el.textContent=`.accent-text{color:${hex}!important;}[style*="#FDE68A"]{color:${hex}!important;}[style*="#BA7517"]{color:${hex}!important;}`;
}

function applyAvatarColourInline(hue: number) {
  const hex=`hsl(${hue},65%,38%)`;
  try{localStorage.setItem("natrix_avatar_hue",String(hue));}catch{}
  document.documentElement.style.setProperty("--natrix-avatar-colour",hex);
  document.documentElement.style.setProperty("--natrix-avatar-text",getContrastText(hex));
}

function resetAllCustomInline(fallbackTheme: string) {
  try{localStorage.removeItem("natrix_custom_bg_hue");localStorage.removeItem("natrix_font_colour");localStorage.removeItem("natrix_avatar_hue");}catch{}
  ["natrix-font-colour"].forEach(id=>{const el=document.getElementById(id);if(el)el.remove();});
  document.documentElement.style.removeProperty("--natrix-font-colour");
  document.documentElement.style.removeProperty("--natrix-avatar-colour");
  document.documentElement.style.removeProperty("--natrix-avatar-text");
  applyTheme(fallbackTheme);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading]         = useState(true);
  const [email, setEmail]             = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAdmin, setIsAdmin]         = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword]           = useState("");
  const [confirmPassword, setConfirmPassword]   = useState("");
  const [passwordMsg, setPasswordMsg]           = useState("");
  const [savingPassword, setSavingPassword]     = useState(false);

  const [activeFontSize, setActiveFontSize] = useState<FontSizeId>("default");
  const [savingFontSize, setSavingFontSize] = useState(false);
  const [fontSizeSaved, setFontSizeSaved]   = useState(false);

  // Background
  const [bgHue, setBgHue]       = useState(210);
  const [customBgOn, setCustomBgOn] = useState(false);

  // Font colour
  const [activeFontColour, setActiveFontColour] = useState<FontColourId|null>(null);

  // Avatar colour
  const [avatarHue, setAvatarHue]       = useState(160);
  const [avatarColourOn, setAvatarColourOn] = useState(false);


  const [colorsSaved, setColorsSaved]   = useState(false);
  const [savingColors, setSavingColors] = useState(false);

  const [feedbackRating, setFeedbackRating]   = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackFeature, setFeedbackFeature] = useState("");
  const [savingFeedback, setSavingFeedback]   = useState(false);
  const [feedbackSent, setFeedbackSent]       = useState(false);
  const [feedbackError, setFeedbackError]     = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput]             = useState("");
  const [deletingAccount, setDeletingAccount]     = useState(false);
  const [loggingOut, setLoggingOut]               = useState(false);
  const [deleteStatus, setDeleteStatus]           = useState("");

  const [activeTheme] = useState(() => {
    try{return localStorage.getItem("natrix_theme")??"ocean";}catch{return "ocean";}
  });

  useEffect(()=>{void loadUser();},[]);

  async function loadUser() {
    const{data:{session}}=await supabase.auth.getSession();
    if(!session){router.replace("/login");return;}
    setEmail(session.user.email??"");
    setIsAdmin(session.user.id===ADMIN_USER_ID);
    const meta=session.user.user_metadata;
    setDisplayName(meta?.full_name??meta?.name??"");
    setActiveFontSize((meta?.app_font_size as FontSizeId)??"default");
    const savedBg=meta?.custom_bg_hue;
    if(savedBg!=null&&savedBg>=0){setBgHue(Number(savedBg));setCustomBgOn(true);}
    const savedFc=meta?.font_colour as FontColourId|undefined;
    if(savedFc)setActiveFontColour(savedFc);
    const savedAv=meta?.avatar_hue as number|undefined;
    if(savedAv!=null&&savedAv>=0){setAvatarHue(Number(savedAv));setAvatarColourOn(true);}
    setLoading(false);
  }

  async function handleSelectFontSize(sizeId: FontSizeId) {
    setActiveFontSize(sizeId); applyFontSize(sizeId);
    setSavingFontSize(true); setFontSizeSaved(false);
    await supabase.auth.updateUser({data:{app_font_size:sizeId}});
    setSavingFontSize(false); setFontSizeSaved(true);
    setTimeout(()=>setFontSizeSaved(false),2000);
  }

  function handleBgHueDrag(hue: number){setBgHue(hue);setCustomBgOn(true);applyCustomBgInline(hue);}

  async function handleBgHueRelease(){
    setSavingColors(true); setColorsSaved(false);
    await supabase.auth.updateUser({data:{custom_bg_hue:bgHue}});
    applyCustomBgInline(bgHue); // re-apply after updateUser triggers ThemeProvider
    setSavingColors(false); setColorsSaved(true);
    setTimeout(()=>setColorsSaved(false),2000);
  }

  async function handleSelectFontColour(colourId: FontColourId){
    const colour=FONT_COLOURS.find(c=>c.id===colourId)!;
    setActiveFontColour(colourId); applyFontColourInline(colour.hex);
    setSavingColors(true); setColorsSaved(false);
    await supabase.auth.updateUser({data:{font_colour:colourId}});
    applyFontColourInline(colour.hex);
    setSavingColors(false); setColorsSaved(true);
    setTimeout(()=>setColorsSaved(false),2000);
  }

  function handleAvatarHueDrag(hue: number){setAvatarHue(hue);setAvatarColourOn(true);applyAvatarColourInline(hue);}

  async function handleAvatarHueRelease(){
    setSavingColors(true);setColorsSaved(false);
    await supabase.auth.updateUser({data:{avatar_hue:avatarHue}});
    applyAvatarColourInline(avatarHue);
    setSavingColors(false);setColorsSaved(true);
    setTimeout(()=>setColorsSaved(false),2000);
  }

  async function handleResetColors(){
    resetAllCustomInline(activeTheme);
    setCustomBgOn(false); setBgHue(210); setActiveFontColour(null);
    setAvatarHue(160); setAvatarColourOn(false);
    await supabase.auth.updateUser({data:{custom_bg_hue:null,font_colour:null,avatar_hue:null}});
  }

  async function handleChangePassword(){
    if(!newPassword){setPasswordMsg("Please enter a new password.");return;}
    if(newPassword.length<8){setPasswordMsg("Password must be at least 8 characters.");return;}
    if(newPassword!==confirmPassword){setPasswordMsg("Passwords don't match.");return;}
    setSavingPassword(true);setPasswordMsg("");
    const{error}=await supabase.auth.updateUser({password:newPassword});
    if(error){setPasswordMsg(`Error: ${error.message}`);}
    else{setPasswordMsg("✓ Password updated successfully.");setNewPassword("");setConfirmPassword("");setTimeout(()=>{setShowPasswordForm(false);setPasswordMsg("");},2000);}
    setSavingPassword(false);
  }

  async function handleSendFeedback(){
    if(feedbackRating===0){setFeedbackError("Please select a star rating.");return;}
    if(!feedbackMessage.trim()){setFeedbackError("Please write something — even a sentence helps!");return;}
    setSavingFeedback(true);setFeedbackError("");
    const{data:{session}}=await supabase.auth.getSession();
    const{error}=await supabase.from("feedback").insert([{user_id:session?.user?.id??null,rating:feedbackRating,message:feedbackMessage.trim(),feature_request:feedbackFeature||null}]);
    if(error){setFeedbackError(`Couldn't send feedback: ${error.message}`);}
    else{setFeedbackSent(true);setFeedbackRating(0);setFeedbackMessage("");setFeedbackFeature("");}
    setSavingFeedback(false);
  }

  async function handleLogout(){setLoggingOut(true);await supabase.auth.signOut();router.replace("/login");}

  async function handleDeleteAccount(){
    if(deleteInput!=="DELETE"){setDeleteStatus("Please type DELETE to confirm.");return;}
    setDeletingAccount(true);setDeleteStatus("Deleting your data...");
    try{
      const res=await fetch("/api/delete-account",{method:"POST"});
      const json=await res.json() as{success?:boolean;dryRun?:boolean;error?:string;log?:string[]};
      if(!res.ok){setDeleteStatus(`Error: ${json.error??"Something went wrong."}`);setDeletingAccount(false);return;}
      if(json.dryRun){console.log("🔒 Dry run log:",json.log);setDeleteStatus("Dry run complete — check browser console.");setDeletingAccount(false);return;}
      await supabase.auth.signOut();router.replace("/login");
    }catch{setDeleteStatus("Network error. Please try again.");setDeletingAccount(false);}
  }

  if(loading)return(<div className="shell"><div className="container-app"><p className="muted">Loading...</p></div></div>);

  const hasCustom=customBgOn||activeFontColour!==null||avatarColourOn;
  const previewTextColour=activeFontColour?FONT_COLOURS.find(c=>c.id===activeFontColour)?.hex:"#FDE68A";
  const previewAvatarBg=avatarColourOn?`hsl(${avatarHue},65%,38%)`:"#0F6E56";
  const previewAvatarText=getContrastText(previewAvatarBg);

  return(
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="pt-2">
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{color:"#BA7517"}}>Natrix</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Settings</h1>
        </div>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <div className="card space-y-4">
          <p className="label">Account</p>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
              style={{background:"rgba(217,119,6,0.25)",color:"#FDE68A",border:"1px solid rgba(253,230,138,0.2)"}}>
              {(displayName||email).slice(0,1).toUpperCase()}
            </div>
            <div className="min-w-0">
              {displayName&&<p className="truncate text-base font-semibold text-white">{displayName}</p>}
              <p className="truncate text-sm text-white/50">{email}</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl" style={{border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)"}}>
            <button type="button" onClick={()=>{setShowPasswordForm(v=>!v);setPasswordMsg("");}}
              className="flex w-full items-center justify-between px-4 py-3 text-left">
              <div className="flex items-center gap-3"><LockIcon/><span className="text-sm font-medium text-white">Change password</span></div>
              <ChevronIcon open={showPasswordForm}/>
            </button>
            {showPasswordForm&&(
              <div className="space-y-3 border-t border-white/10 px-4 pb-4 pt-3">
                <input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="New password" className="input"/>
                <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="input"/>
                {passwordMsg&&<p className="text-sm" style={{color:passwordMsg.startsWith("✓")?"#6EE7B7":"#FCA5A5"}}>{passwordMsg}</p>}
                <button type="button" onClick={handleChangePassword} disabled={savingPassword}
                  className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
                  style={{background:"#D97706"}}>{savingPassword?"Saving...":"Update password"}</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Admin (only visible to Julian) ─────────────────────────────── */}
        {isAdmin&&(
          <Link href="/admin/meets"
            className="flex items-center justify-between rounded-2xl px-4 py-3.5 transition"
            style={{background:"rgba(217,119,6,0.12)",border:"1px solid rgba(253,230,138,0.25)"}}>
            <div className="flex items-center gap-3">
              <span style={{fontSize:18}}>🛠️</span>
              <div>
                <p className="text-sm font-semibold" style={{color:"#FDE68A"}}>Manage meets</p>
                <p className="mt-0.5 text-xs text-white/40">Admin only · add or edit the meet calendar</p>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="rgba(253,230,138,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
        )}

        {/* ── Appearance ──────────────────────────────────────────────────── */}
        <div className="card space-y-6">
          <p className="label">Appearance</p>

          {/* Live preview */}
          <div className="rounded-2xl p-4 space-y-2" style={{background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.08)"}}>
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Preview</p>
            <div className="flex items-center gap-4">
              {/* Avatar preview */}
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-base font-bold transition-colors"
                style={{background:previewAvatarBg,color:previewAvatarText}}>
                ML
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-white">Mikaela Loh</p>
                <p className="text-xs text-white/40">Age 10 · SSC</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-sm font-bold" style={{color:previewTextColour??undefined}}>10</span>
                  <span className="text-[10px] text-white/30 uppercase">events</span>
                  <span className="text-sm font-bold text-white/60">31</span>
                  <span className="text-[10px] text-white/30 uppercase">results</span>
                </div>
              </div>
            </div>
          </div>

          {/* Background bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Background</p>
              <div className="h-5 w-5 rounded-full border border-white/25 transition-colors"
                style={{background:customBgOn?`hsl(${bgHue},60%,22%)`:"rgba(255,255,255,0.12)"}}/>
            </div>
            <input type="range" min="0" max="360" step="1" value={bgHue}
              onChange={e=>handleBgHueDrag(Number(e.target.value))}
              onMouseUp={()=>void handleBgHueRelease()} onTouchEnd={()=>void handleBgHueRelease()}
              className="w-full h-3 rounded-full outline-none cursor-pointer"
              style={{background:BG_GRADIENT,WebkitAppearance:"none",appearance:"none"}}/>
            <p className="text-[10px] text-white/30">Drag to shift background colour</p>
          </div>

          {/* Font colour chips */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Font colour</p>
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Bright</p>
              <div className="grid grid-cols-3 gap-2">
                {FONT_COLOURS.filter(c=>!c.dark).map(colour=>{
                  const isActive=activeFontColour===colour.id;
                  return(
                    <button key={colour.id} type="button" onClick={()=>void handleSelectFontColour(colour.id)}
                      className="relative flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 transition"
                      style={{background:isActive?`${colour.hex}22`:"rgba(255,255,255,0.05)",border:isActive?`2px solid ${colour.hex}`:"1px solid rgba(255,255,255,0.12)"}}>
                      <div className="h-6 w-6 rounded-full" style={{background:colour.hex,border:colour.id==="white"?"1px solid rgba(255,255,255,0.3)":"none",boxShadow:isActive?`0 0 10px ${colour.hex}88`:"none"}}/>
                      <span className="text-[10px] font-semibold" style={{color:isActive?colour.hex:"rgba(255,255,255,0.45)"}}>{colour.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Dark</p>
              <div className="grid grid-cols-3 gap-2">
                {FONT_COLOURS.filter(c=>c.dark).map(colour=>{
                  const isActive=activeFontColour===colour.id;
                  return(
                    <button key={colour.id} type="button" onClick={()=>void handleSelectFontColour(colour.id)}
                      className="relative flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 transition"
                      style={{background:isActive?`${colour.hex}22`:"rgba(255,255,255,0.05)",border:isActive?`2px solid ${colour.hex}`:"1px solid rgba(255,255,255,0.12)"}}>
                      <div className="h-6 w-6 rounded-full" style={{background:colour.hex,border:colour.id==="black"?"1px solid rgba(255,255,255,0.2)":"none",boxShadow:isActive?`0 0 10px ${colour.hex}88`:"none"}}/>
                      <span className="text-[10px] font-semibold" style={{color:isActive?colour.hex:"rgba(255,255,255,0.45)"}}>{colour.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Avatar colour slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Avatar colour</p>
              <div className="h-5 w-5 rounded-full border border-white/25 transition-colors"
                style={{background:previewAvatarBg}}/>
            </div>
            <input type="range" min="0" max="360" step="1" value={avatarHue}
              onChange={e=>handleAvatarHueDrag(Number(e.target.value))}
              onMouseUp={()=>void handleAvatarHueRelease()} onTouchEnd={()=>void handleAvatarHueRelease()}
              className="w-full h-3 rounded-full outline-none cursor-pointer"
              style={{background:AVATAR_GRADIENT,WebkitAppearance:"none",appearance:"none"}}/>
            <p className="text-[10px] text-white/30">Drag to change your swimmer&apos;s avatar colour</p>
          </div>

          {/* Status + reset */}
          <div className="flex items-center gap-3">
            {hasCustom&&(
              <button type="button" onClick={()=>void handleResetColors()}
                className="flex-1 rounded-2xl py-2.5 text-xs font-medium text-white/40 transition"
                style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)"}}>
                Reset to defaults
              </button>
            )}
            {colorsSaved&&<p className="text-xs flex-1 text-center" style={{color:"#6EE7B7"}}>✓ Saved</p>}
            {savingColors&&<p className="text-xs flex-1 text-center text-white/30">Saving...</p>}
          </div>
        </div>

        {/* ── Text Size ───────────────────────────────────────────────────── */}
        <div className="card space-y-4">
          <div>
            <p className="label">Text Size</p>
            <p className="mt-1 text-xs text-white/40">Applies instantly across the whole app.</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {FONT_SIZES.map(size=>{
              const isActive=activeFontSize===size.id;
              return(
                <button key={size.id} type="button" onClick={()=>void handleSelectFontSize(size.id as FontSizeId)} disabled={savingFontSize}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 transition disabled:opacity-60"
                  style={isActive?{background:"rgba(217,119,6,0.2)",border:"2px solid #D97706"}:{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)"}}>
                  <span className="font-bold leading-none text-white" style={{fontSize:`${10+FONT_SIZES.indexOf(size)*3}px`}}>Aa</span>
                  <span className="text-[9px] font-medium" style={{color:isActive?"#FDE68A":"rgba(255,255,255,0.4)"}}>{size.label}</span>
                </button>
              );
            })}
          </div>
          {fontSizeSaved&&<p className="text-center text-xs" style={{color:"#6EE7B7"}}>✓ Text size saved</p>}
          {savingFontSize&&<p className="text-center text-xs text-white/30">Saving...</p>}
        </div>

        {/* ── Splash screen ───────────────────────────────────────────────── */}
        <SplashMediaUpload/>

        {/* ── Help ────────────────────────────────────────────────────────── */}
        <div className="card">
          <p className="label mb-3">Help</p>
          <button type="button" onClick={replayTutorial}
            className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition"
            style={{background:"rgba(217,119,6,0.1)",border:"1px solid rgba(253,230,138,0.2)"}}>
            <div className="flex items-center gap-3">
              <span style={{fontSize:18}}>🎓</span>
              <div>
                <p className="text-sm font-semibold" style={{color:"#FDE68A"}}>Replay tutorial</p>
                <p className="mt-0.5 text-xs text-white/40">Walk through the app step by step again</p>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="rgba(253,230,138,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button type="button" onClick={()=>router.push("/scan")}
            className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition mt-3"
            style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)"}}>
            <div className="flex items-center gap-3">
              <span style={{fontSize:18}}>📥</span>
              <div>
                <p className="text-sm font-semibold text-white">Import swimmer data</p>
                <p className="mt-0.5 text-xs text-white/40">Download template · upload your existing times</p>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div className="mt-4 space-y-2">
            <p className="mb-2 text-[9px] uppercase tracking-wider text-white/30">Quick reference</p>
            {[
              {emoji:"👥",title:"Add a swimmer",desc:"Tap Brood → + button → fill in profile"},
              {emoji:"📷",title:"Scan a result",desc:"Tap Scan → upload Meet Mobile screenshot"},
              {emoji:"📈",title:"View progress",desc:"Swimmer profile → Progress tab"},
              {emoji:"⭐",title:"Check standards",desc:"Swimmer profile → Standards tab"},
            ].map(item=>(
              <div key={item.title} className="flex items-start gap-3 rounded-2xl px-3 py-2.5"
                style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)"}}>
                <span style={{fontSize:16,flexShrink:0,marginTop:1}}>{item.emoji}</span>
                <div><p className="text-sm font-medium text-white">{item.title}</p><p className="text-xs text-white/40">{item.desc}</p></div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Feedback ────────────────────────────────────────────────────── */}
        <div className="card space-y-4">
          <div>
            <p className="label">Feedback</p>
            <p className="mt-1 text-xs text-white/40">Help shape Natrix — every message goes straight to J.O.D.</p>
          </div>
          {feedbackSent?(
            <div className="space-y-2 rounded-2xl py-6 text-center" style={{background:"rgba(217,119,6,0.1)",border:"1px solid rgba(253,230,138,0.2)"}}>
              <p className="text-2xl">🙏</p>
              <p className="text-sm font-semibold" style={{color:"#FDE68A"}}>Thank you!</p>
              <p className="text-xs text-white/40">Your feedback means the world. We&apos;ll use it to make Natrix better.</p>
              <button type="button" onClick={()=>setFeedbackSent(false)} className="mt-2 text-xs text-white/30 underline">Send another</button>
            </div>
          ):(
            <>
              <div>
                <p className="mb-2 text-xs text-white/50">How are you finding Natrix?</p>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(star=>(
                    <button key={star} type="button" onClick={()=>setFeedbackRating(star)}
                      className="text-2xl transition-transform active:scale-90"
                      style={{opacity:feedbackRating>=star?1:0.25,filter:feedbackRating>=star?"none":"grayscale(1)"}}>⭐</button>
                  ))}
                </div>
                {feedbackRating>0&&<p className="mt-1.5 text-xs" style={{color:"#FDE68A"}}>{feedbackRating===5?"Love it! 🏊":feedbackRating===4?"Really good!":feedbackRating===3?"It's okay":feedbackRating===2?"Needs work":"Not great"}</p>}
              </div>
              <div>
                <p className="mb-2 text-xs text-white/50">What would make Natrix better?</p>
                <textarea value={feedbackMessage} onChange={e=>setFeedbackMessage(e.target.value)}
                  placeholder="Tell us anything — bugs, ideas, what you love, what's missing..."
                  rows={3} className="w-full resize-none rounded-[20px] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                  style={{background:"rgba(0,20,50,0.35)",border:"1px solid rgba(255,255,255,0.2)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)"}}/>
              </div>
              <div>
                <p className="mb-2 text-xs text-white/50">Most wanted feature (optional)</p>
                <select value={feedbackFeature} onChange={e=>setFeedbackFeature(e.target.value)} className="input">
                  <option value="">Pick one...</option>
                  {FEATURE_REQUESTS.map(f=><option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              {feedbackError&&<p className="text-sm" style={{color:"#FCA5A5"}}>{feedbackError}</p>}
              <button type="button" onClick={handleSendFeedback} disabled={savingFeedback}
                className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
                style={{background:"#D97706"}}>{savingFeedback?"Sending...":"Send feedback 🚀"}</button>
            </>
          )}
        </div>

        {/* ── About ───────────────────────────────────────────────────────── */}
        <div className="card">
          <p className="label mb-3">About</p>
          {[
            {label:"Version",value:APP_VERSION,color:undefined},
            {label:"Built for",value:"Southeast Asia · expanding globally",color:undefined},
            {label:"Made with",value:"🏊 for swim parents",color:"#FDE68A"},
            {label:"Developed by",value:"J.O.D — Just an Ordinary Dad",color:undefined},
          ].map((row,i,arr)=>(
            <div key={row.label}>
              <div className="flex items-center justify-between py-2">
                <p className="text-sm text-white/60">{row.label}</p>
                <p className="text-sm font-semibold text-white" style={row.color?{color:row.color}:undefined}>{row.value}</p>
              </div>
              {i<arr.length-1&&<div style={{height:1,background:"rgba(255,255,255,0.08)"}}/>}
            </div>
          ))}
        </div>

        <Link href="/privacy" className="block w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/50 transition hover:bg-white/10">
          Privacy Policy
        </Link>

        <button type="button" onClick={handleLogout} disabled={loggingOut}
          className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-50"
          style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.85)"}}>
          {loggingOut?"Signing out...":"Sign out"}
        </button>

        <div className="overflow-hidden rounded-3xl" style={{border:"1px solid rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.06)"}}>
          <button type="button" onClick={()=>{setShowDeleteConfirm(v=>!v);setDeleteInput("");setDeleteStatus("");}}
            className="flex w-full items-center justify-between px-5 py-4 text-left">
            <div>
              <p className="text-sm font-semibold" style={{color:"#FCA5A5"}}>Delete account</p>
              <p className="mt-0.5 text-xs text-white/35">Permanently removes all your data</p>
            </div>
            <ChevronIcon open={showDeleteConfirm} danger/>
          </button>
          {showDeleteConfirm&&(
            <div className="space-y-3 border-t border-red-500/15 px-5 pb-5 pt-4">
              <p className="text-sm leading-relaxed text-white/60">This will permanently delete your account and all swimmer data. This cannot be undone. Type <span className="font-bold text-white">DELETE</span> to confirm.</p>
              <input value={deleteInput} onChange={e=>setDeleteInput(e.target.value)} placeholder="Type DELETE to confirm" className="input" style={{borderColor:"rgba(239,68,68,0.3)"}}/>
              {deleteStatus&&<p className="text-sm" style={{color:"#FCA5A5"}}>{deleteStatus}</p>}
              <button type="button" onClick={handleDeleteAccount} disabled={deletingAccount||deleteInput!=="DELETE"}
                className="w-full rounded-2xl py-3 text-sm font-semibold transition disabled:opacity-40"
                style={{background:"rgba(239,68,68,0.25)",border:"1px solid rgba(239,68,68,0.4)",color:"#FCA5A5"}}>
                {deletingAccount?"Deleting...":"Permanently delete account"}
              </button>
            </div>
          )}
        </div>

        <div className="h-4"/>
      </div>
    </div>
  );
}

function LockIcon(){return(<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" strokeLinecap="round"/></svg>);}
function ChevronIcon({open,danger}:{open:boolean;danger?:boolean}){return(<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s ease"}}><path d="M4 6l4 4 4-4" stroke={danger?"rgba(252,165,165,0.6)":"rgba(255,255,255,0.3)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>);}