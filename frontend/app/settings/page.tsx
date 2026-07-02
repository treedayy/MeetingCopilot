"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, UserCog } from "lucide-react";
import { api, type Profile } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [techInput, setTechInput] = useState("");
  const [goalsInput, setGoalsInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.getProfile()
      .then((p) => {
        setProfile(p);
        setTechInput(p.known_technologies.join(", "));
        setGoalsInput(p.learning_goals.join(", "));
      })
      .catch(() => setError(true));
  }, []);

  const save = async () => {
    if (!profile) return;
    const updated = await api.updateProfile({
      name: profile.name,
      role: profile.role,
      experience: profile.experience,
      depth: profile.depth,
      known_technologies: techInput.split(",").map((s) => s.trim()).filter(Boolean),
      learning_goals: goalsInput.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setProfile(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const field = "w-full rounded-xl border border-edge bg-panel px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-accent/60";
  const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-slate-500";

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-accent/50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Home
        </button>
        <div className="flex items-center gap-2">
          <UserCog className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-bold text-white">Personalization</h1>
        </div>
      </div>

      {error && <p className="text-sm text-red-300">Backend unreachable — start it and reload.</p>}
      {profile && (
        <div className="space-y-5">
          <p className="text-sm text-slate-400">
            The copilot adapts to you: concepts you already know are shown compactly instead of
            re-taught, explanations default to your preferred depth, and the coach uses your name to
            track your participation.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={label}>Your name (as you speak in meetings)</label>
              <input className={field} value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </div>
            <div>
              <label className={label}>Role</label>
              <input className={field} placeholder="e.g. Junior backend engineer" value={profile.role}
                onChange={(e) => setProfile({ ...profile, role: e.target.value })} />
            </div>
            <div>
              <label className={label}>Experience level</label>
              <select className={field} value={profile.experience}
                onChange={(e) => setProfile({ ...profile, experience: e.target.value })}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="expert">Expert</option>
              </select>
            </div>
            <div>
              <label className={label}>Default explanation depth</label>
              <select className={field} value={profile.depth}
                onChange={(e) => setProfile({ ...profile, depth: e.target.value })}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Technologies you already know (comma-separated)</label>
            <input className={field} placeholder="React, Postgres, Docker…" value={techInput}
              onChange={(e) => setTechInput(e.target.value)} />
          </div>
          <div>
            <label className={label}>Learning goals (comma-separated)</label>
            <input className={field} placeholder="Kubernetes, system design…" value={goalsInput}
              onChange={(e) => setGoalsInput(e.target.value)} />
          </div>

          {Object.keys(profile.learned).length > 0 && (
            <div>
              <label className={label}>Concepts the copilot has taught you so far</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(profile.learned)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([term, info]) => (
                    <span key={term} className="chip border border-edge text-slate-300">
                      {term} ·{info.count}×
                    </span>
                  ))}
              </div>
            </div>
          )}

          <button
            onClick={save}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {saved ? <Check className="h-4 w-4" /> : null}
            {saved ? "Saved" : "Save profile"}
          </button>
        </div>
      )}
    </main>
  );
}
