import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "studyai-data-v1";

const difficultyScore = {
  Easy: 30,
  Medium: 60,
  Hard: 90
};

function daysUntil(date) {
  if (!date) return 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(`${date}T00:00:00`);
  return Math.ceil((exam - today) / 86400000);
}

function urgencyScore(date) {
  const d = daysUntil(date);
  if (d <= 0) return 100;
  return Math.max(10, Math.min(100, 100 - (d - 1) * 3));
}

function calculatePriority(subject) {
  const urgency = urgencyScore(subject.examDate);
  const difficulty = difficultyScore[subject.difficulty] || 60;
  const weakness = 100 - Number(subject.confidence || 0);
  const target = Number(subject.targetMark || 0);
  return Math.round(urgency * 0.4 + difficulty * 0.3 + weakness * 0.2 + target * 0.1);
}

function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function makePlan(subjects, hours, completed = []) {
  if (!subjects.length || !hours) return [];
  const total = Math.max(30, Math.round(Number(hours) * 60));
  const ranked = subjects
    .map((s) => ({ ...s, priority: calculatePriority(s) }))
    .sort((a, b) => b.priority - a.priority);

  const weights = ranked.map((s) => Math.max(1, s.priority));
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  let remaining = total;

  return ranked.map((subject, index) => {
    const isLast = index === ranked.length - 1;
    let minutes = isLast
      ? remaining
      : Math.max(30, Math.round((total * subject.priority) / weightTotal / 15) * 15);

    const maxRemainingForOthers = (ranked.length - index - 1) * 30;
    minutes = Math.min(minutes, Math.max(30, remaining - maxRemainingForOthers));
    remaining -= minutes;

    const done = completed.find(
      (x) => x.date === getTodayKey() && x.subjectId === subject.id
    );

    return {
      id: `${getTodayKey()}-${subject.id}`,
      subjectId: subject.id,
      subjectName: subject.name,
      priority: subject.priority,
      minutes,
      completed: Boolean(done?.completed),
      missed: Boolean(done?.missed)
    };
  });
}

function App() {
  const [data, setData] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
    } catch {
      return null;
    }
  });
  const [screen, setScreen] = useState(data ? "dashboard" : "home");
  const [activeNav, setActiveNav] = useState("dashboard");
  const [focusSubject, setFocusSubject] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const subjects = data?.subjects || [];
  const completed = data?.completed || [];
  const plan = useMemo(
    () => makePlan(subjects, data?.profile?.hours || 0, completed),
    [subjects, data?.profile?.hours, completed]
  );

  const ranked = useMemo(
    () => subjects.map(s => ({ ...s, priority: calculatePriority(s) })).sort((a,b) => b.priority-a.priority),
    [subjects]
  );

  const averageConfidence = subjects.length
    ? Math.round(subjects.reduce((sum, s) => sum + Number(s.confidence), 0) / subjects.length)
    : 0;

  const totalPlanned = plan.reduce((sum, x) => sum + x.minutes, 0);
  const totalCompleted = completed
    .filter(x => x.completed)
    .reduce((sum, x) => sum + x.minutes, 0);

  function notify(message) {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  }

  function startApp(profile, newSubjects) {
    const next = { profile, subjects: newSubjects, completed: [] };
    setData(next);
    setScreen("dashboard");
    setActiveNav("dashboard");
  }

  function updateSession(subjectId, status) {
    const session = plan.find(x => x.subjectId === subjectId);
    if (!session) return;
    const today = getTodayKey();

    setData(prev => {
      const old = (prev.completed || []).filter(
        x => !(x.date === today && x.subjectId === subjectId)
      );
      return {
        ...prev,
        completed: [
          ...old,
          { date: today, subjectId, minutes: session.minutes, completed: status === "completed", missed: status === "missed" }
        ]
      };
    });

    notify(status === "completed"
      ? `${session.subjectName} session completed!`
      : `${session.subjectName} marked missed. Plan will adapt.`);
  }

  function resetApp() {
    localStorage.removeItem(STORAGE_KEY);
    setData(null);
    setScreen("home");
  }

  if (screen === "home") {
    return <Home onStart={() => setScreen("setup")} />;
  }

  if (screen === "setup") {
    return (
      <Setup
        initial={data}
        onBack={() => setScreen(data ? "dashboard" : "home")}
        onSave={startApp}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        active={activeNav}
        onChange={(item) => setActiveNav(item)}
        onSetup={() => setScreen("setup")}
        onReset={resetApp}
      />

      <main className="main-content">
        <Topbar profile={data.profile} onSetup={() => setScreen("setup")} />

        {activeNav === "dashboard" && (
          <Dashboard
            profile={data.profile}
            subjects={subjects}
            ranked={ranked}
            averageConfidence={averageConfidence}
            plan={plan}
            totalPlanned={totalPlanned}
            totalCompleted={totalCompleted}
            onSession={updateSession}
            onFocus={setFocusSubject}
            onNavigate={setActiveNav}
          />
        )}

        {activeNav === "universe" && (
          <StudyUniverse subjects={ranked} />
        )}

        {activeNav === "subjects" && (
          <SubjectsPage
            subjects={subjects}
            onEdit={() => setScreen("setup")}
            onDelete={(id) => {
              setData(prev => ({ ...prev, subjects: prev.subjects.filter(s => s.id !== id) }));
              notify("Subject removed.");
            }}
          />
        )}

        {activeNav === "planner" && (
          <PlannerPage plan={plan} onSession={updateSession} onFocus={setFocusSubject} />
        )}

        {activeNav === "analytics" && (
          <Analytics subjects={subjects} plan={plan} averageConfidence={averageConfidence} />
        )}

        {activeNav === "coach" && (
          <Coach ranked={ranked} profile={data.profile} plan={plan} />
        )}
      </main>

      {focusSubject && (
        <FocusMode
          subject={focusSubject}
          onClose={() => setFocusSubject(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Home({ onStart }) {
  return (
    <div className="home-page">
      <nav className="landing-nav">
        <div className="brand"><span className="brand-orb">✦</span> StudyAI</div>
        <button className="nav-ghost" onClick={onStart}>Build my plan →</button>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">AI-POWERED • ADAPTIVE • PERSONAL</div>
          <h1>Study smarter.<br /><span>Adapt faster.</span></h1>
          <p>
            A personal study planner that turns your subjects, confidence,
            difficulty and exam dates into a living timetable that adapts when life changes.
          </p>
          <div className="hero-actions">
            <button className="primary-btn" onClick={onStart}>Create my study plan <span>→</span></button>
            <div className="trust-note">No account • No API key • Data stays in your browser</div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="orbit orbit-one"></div>
          <div className="orbit orbit-two"></div>
          <div className="core">
            <div className="core-inner">AI</div>
          </div>
          <div className="floating-chip chip-a">⚡ Priority Engine</div>
          <div className="floating-chip chip-b">◉ Weakness Detection</div>
          <div className="floating-chip chip-c">↻ Adaptive Recovery</div>
          <div className="visual-caption">YOUR STUDY UNIVERSE</div>
        </div>
      </section>

      <section className="feature-strip">
        <Feature icon="◈" title="Adaptive Planner" text="Priorities change with exam urgency and confidence." />
        <Feature icon="◎" title="3D Study Universe" text="See your own subjects as a visual learning map." />
        <Feature icon="◷" title="Focus Mode" text="Turn any plan item into a focused session." />
        <Feature icon="✦" title="AI Coach" text="Get simple, actionable study guidance." />
      </section>
    </div>
  );
}

function Feature({ icon, title, text }) {
  return <div className="feature">
    <div className="feature-icon">{icon}</div>
    <div><strong>{title}</strong><p>{text}</p></div>
  </div>;
}

function Setup({ initial, onBack, onSave }) {
  const [profile, setProfile] = useState(initial?.profile || {
    name: "", course: "", semester: "", hours: 3
  });
  const [subjects, setSubjects] = useState(initial?.subjects || []);
  const [form, setForm] = useState({
    name: "", difficulty: "Medium", confidence: 50,
    examDate: "", targetMark: 80
  });

  function addSubject() {
    if (!form.name.trim() || !form.examDate) return;
    setSubjects(prev => [...prev, {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      difficulty: form.difficulty,
      confidence: Number(form.confidence),
      examDate: form.examDate,
      targetMark: Number(form.targetMark)
    }]);
    setForm({ name: "", difficulty: "Medium", confidence: 50, examDate: "", targetMark: 80 });
  }

  function save() {
    if (!profile.name || !profile.course || !profile.semester || !profile.hours || !subjects.length) {
      alert("Please complete your profile and add at least one subject.");
      return;
    }
    onSave(profile, subjects);
  }

  return (
    <div className="setup-page">
      <div className="setup-top">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <div className="brand"><span className="brand-orb">✦</span> StudyAI</div>
        <div className="step-label">Personalize your engine</div>
      </div>

      <div className="setup-wrap">
        <div className="setup-heading">
          <div className="eyebrow">STEP 01 / PROFILE</div>
          <h1>Tell StudyAI about you.</h1>
          <p>These details power your personalized timetable. You can change them anytime.</p>
        </div>

        <div className="form-card">
          <div className="form-grid">
            <Field label="Your name"><input value={profile.name} onChange={e => setProfile({...profile, name:e.target.value})} placeholder="e.g. Sakthi" /></Field>
            <Field label="Course"><input value={profile.course} onChange={e => setProfile({...profile, course:e.target.value})} placeholder="e.g. B.Tech ECE" /></Field>
            <Field label="Semester"><input value={profile.semester} onChange={e => setProfile({...profile, semester:e.target.value})} placeholder="e.g. Semester 5" /></Field>
            <Field label="Available study hours / day"><input type="number" min="0.5" max="16" step="0.5" value={profile.hours} onChange={e => setProfile({...profile, hours:e.target.value})} /></Field>
          </div>
        </div>

        <div className="section-heading">
          <div><div className="eyebrow">STEP 02 / SUBJECTS</div><h2>Add your subjects</h2></div>
          <span>{subjects.length} subject{subjects.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="form-card subject-builder">
          <div className="form-grid subject-grid">
            <Field label="Subject name"><input value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="e.g. Signals & Systems" /></Field>
            <Field label="Difficulty">
              <select value={form.difficulty} onChange={e => setForm({...form, difficulty:e.target.value})}>
                <option>Easy</option><option>Medium</option><option>Hard</option>
              </select>
            </Field>
            <Field label={`Confidence: ${form.confidence}%`}>
              <input type="range" min="0" max="100" value={form.confidence} onChange={e => setForm({...form, confidence:e.target.value})} />
            </Field>
            <Field label="Exam date"><input type="date" value={form.examDate} onChange={e => setForm({...form, examDate:e.target.value})} /></Field>
            <Field label="Target mark"><input type="number" min="1" max="100" value={form.targetMark} onChange={e => setForm({...form, targetMark:e.target.value})} /></Field>
            <div className="add-subject-wrap"><button className="secondary-btn" onClick={addSubject}>+ Add subject</button></div>
          </div>
        </div>

        {subjects.length > 0 && (
          <div className="added-subjects">
            {subjects.map(s => (
              <div className="subject-row" key={s.id}>
                <div className="subject-dot" style={{"--p": calculatePriority(s)}}></div>
                <div className="subject-main"><strong>{s.name}</strong><span>{s.difficulty} • {s.confidence}% confidence • Exam {s.examDate}</span></div>
                <div className="mini-priority">P{calculatePriority(s)}</div>
                <button className="icon-btn" onClick={() => setSubjects(subjects.filter(x => x.id !== s.id))}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="setup-footer">
          <div><strong>Ready?</strong><span>StudyAI will calculate priorities and build today's plan automatically.</span></div>
          <button className="primary-btn" onClick={save}>Generate my timetable <span>→</span></button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Sidebar({ active, onChange, onSetup, onReset }) {
  const items = [
    ["dashboard", "⌂", "Dashboard"],
    ["universe", "✧", "Study Universe"],
    ["subjects", "▣", "Subjects"],
    ["planner", "◷", "Planner"],
    ["analytics", "◒", "Analytics"],
    ["coach", "✦", "AI Coach"]
  ];
  return <aside className="sidebar">
    <div className="side-brand"><span className="brand-orb">✦</span> StudyAI</div>
    <div className="side-label">WORKSPACE</div>
    <div className="side-nav">
      {items.map(([id, icon, label]) => (
        <button key={id} className={active === id ? "side-item active" : "side-item"} onClick={() => onChange(id)}>
          <span>{icon}</span>{label}
        </button>
      ))}
    </div>
    <div className="sidebar-bottom">
      <button className="side-item" onClick={onSetup}><span>⚙</span>Edit profile</button>
      <button className="side-item danger" onClick={onReset}><span>↺</span>Start over</button>
    </div>
  </aside>;
}

function Topbar({ profile, onSetup }) {
  return <header className="topbar">
    <div>
      <div className="top-title">Good to see you, {profile.name || "student"}.</div>
      <div className="top-sub">{profile.course} • {profile.semester} • {profile.hours}h available today</div>
    </div>
    <button className="avatar" onClick={onSetup}>{(profile.name || "S").charAt(0).toUpperCase()}</button>
  </header>;
}

function Dashboard({ profile, subjects, ranked, averageConfidence, plan, totalPlanned, totalCompleted, onSession, onFocus, onNavigate }) {
  const top = ranked[0];
  const nextExam = ranked.length ? Math.min(...ranked.map(s => Math.max(0, daysUntil(s.examDate)))) : 0;
  const todayProgress = plan.length ? Math.round((plan.filter(x => x.completed).length / plan.length) * 100) : 0;

  return <div className="page">
    <div className="page-intro">
      <div><div className="eyebrow">OVERVIEW / TODAY</div><h1>Your adaptive command center.</h1><p>StudyAI has ranked your workload based on urgency, difficulty and confidence.</p></div>
      <button className="primary-btn small" onClick={() => onNavigate("planner")}>Open today's plan →</button>
    </div>

    <div className="stats-grid">
      <Stat label="Subjects" value={subjects.length} sub="active" icon="▣" />
      <Stat label="Today's plan" value={formatMinutes(totalPlanned)} sub={`${todayProgress}% complete`} icon="◷" />
      <Stat label="Avg. confidence" value={`${averageConfidence}%`} sub="across subjects" icon="◎" />
      <Stat label="Nearest exam" value={`${nextExam}d`} sub={top ? top.name : "Add subjects"} icon="⚡" />
    </div>

    <div className="dashboard-grid">
      <section className="panel planner-panel">
        <PanelHeader title="Today's study plan" meta={`${formatMinutes(totalPlanned)} total`} action={() => onNavigate("planner")} />
        {plan.length ? plan.map(item => (
          <PlanItem key={item.id} item={item} onSession={onSession} onFocus={onFocus} />
        )) : <EmptyState text="Add subjects to generate your plan." />}
      </section>

      <section className="panel priority-panel">
        <PanelHeader title="Priority engine" meta="Live ranking" />
        {ranked.slice(0, 5).map((s, i) => (
          <div className="priority-item" key={s.id}>
            <span className="rank">0{i+1}</span>
            <div className="priority-info"><strong>{s.name}</strong><span>Exam in {Math.max(0, daysUntil(s.examDate))}d • {s.confidence}% confidence</span></div>
            <div className="priority-score">P{s.priority}</div>
          </div>
        ))}
        {!ranked.length && <EmptyState text="Your ranking appears here." />}
      </section>
    </div>

    <section className="panel universe-preview">
      <div className="universe-copy">
        <div className="eyebrow">VISUAL INTELLIGENCE</div>
        <h2>Your Study Universe</h2>
        <p>Every subject becomes a live node. Higher-priority subjects move closer to the AI Core.</p>
        <button className="secondary-btn" onClick={() => onNavigate("universe")}>Explore universe →</button>
      </div>
      <MiniUniverse subjects={ranked} />
    </section>

    <section className="insight-card">
      <div className="insight-icon">✦</div>
      <div><div className="eyebrow">AI COACH INSIGHT</div><strong>{coachMessage(ranked, profile, plan)}</strong><p>Based on your current inputs and today's adaptive plan.</p></div>
    </section>
  </div>;
}

function Stat({ label, value, sub, icon }) {
  return <div className="stat-card"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>;
}

function PanelHeader({ title, meta, action }) {
  return <div className="panel-header"><div><h2>{title}</h2><span>{meta}</span></div>{action && <button className="text-btn" onClick={action}>View all →</button>}</div>;
}

function PlanItem({ item, onSession, onFocus }) {
  const state = item.completed ? "done" : item.missed ? "missed" : "";
  return <div className={`plan-item ${state}`}>
    <div className="plan-time">{item.minutes}<small>MIN</small></div>
    <div className="plan-line"></div>
    <div className="plan-content"><strong>{item.subjectName}</strong><span>Priority {item.priority} • {item.completed ? "Completed" : item.missed ? "Missed — recovery queued" : "Recommended focus block"}</span></div>
    {!item.completed && <button className="focus-btn" onClick={() => onFocus(item.subjectName)}>Focus</button>}
    {!item.completed && !item.missed && <button className="complete-btn" onClick={() => onSession(item.subjectId, "completed")}>✓</button>}
    {!item.completed && !item.missed && <button className="miss-btn" onClick={() => onSession(item.subjectId, "missed")}>Missed</button>}
  </div>;
}

function EmptyState({ text }) { return <div className="empty">{text}</div>; }

function MiniUniverse({ subjects }) {
  const list = subjects.slice(0, 6);
  return <div className="mini-universe"><div className="mini-core">AI</div>{list.map((s,i) => {
    const angle = (i / Math.max(1,list.length)) * Math.PI * 2;
    const x = 50 + Math.cos(angle) * 37;
    const y = 50 + Math.sin(angle) * 37;
    return <div key={s.id} className="mini-node" style={{left:`${x}%`, top:`${y}%`}} title={s.name}>{s.name.slice(0,10)}</div>;
  })}</div>;
}

function StudyUniverse({ subjects }) {
  return <div className="page universe-page">
    <div className="page-intro">
      <div><div className="eyebrow">3D VISUALIZATION</div><h1>Study Universe</h1><p>Your subjects are connected to the AI Core. Priority changes the visual weight of each node.</p></div>
    </div>
    <div className="universe-stage">
      <div className="big-orbit o1"></div><div className="big-orbit o2"></div><div className="big-orbit o3"></div>
      <div className="universe-core"><span>AI</span><small>STUDY CORE</small></div>
      {subjects.map((s,i) => {
        const angle = (i / Math.max(1,subjects.length)) * Math.PI * 2 - Math.PI/2;
        const radius = 34 + (100-s.priority)*0.08;
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;
        const size = 74 + s.priority * 0.22;
        return <div className="universe-node" key={s.id} style={{left:`${x}%`, top:`${y}%`, width:size, height:size}}>
          <strong>{s.name}</strong><span>P{s.priority}</span>
        </div>;
      })}
      {!subjects.length && <div className="universe-empty">Add subjects to activate your universe.</div>}
    </div>
    <div className="universe-legend">
      <div><span className="legend-dot high"></span> High priority</div>
      <div><span className="legend-dot mid"></span> Medium priority</div>
      <div><span className="legend-dot low"></span> Lower priority</div>
      <p>Tip: Hard subjects with low confidence and near exams naturally rise in priority.</p>
    </div>
  </div>;
}

function SubjectsPage({ subjects, onEdit, onDelete }) {
  return <div className="page">
    <div className="page-intro"><div><div className="eyebrow">WORKLOAD</div><h1>Your subjects.</h1><p>These are the inputs used by the adaptive priority engine.</p></div><button className="primary-btn small" onClick={onEdit}>Edit subjects →</button></div>
    <div className="subject-cards">{subjects.map(s => {
      const p = calculatePriority(s);
      return <div className="large-subject-card" key={s.id}>
        <div className="subject-card-top"><span className="subject-number">P{p}</span><button className="icon-btn" onClick={() => onDelete(s.id)}>×</button></div>
        <h2>{s.name}</h2>
        <div className="tag-row"><span>{s.difficulty}</span><span>{s.confidence}% confidence</span><span>Target {s.targetMark}%</span></div>
        <div className="confidence-bar"><i style={{width:`${s.confidence}%`}}></i></div>
        <small>Exam: {s.examDate} • {Math.max(0,daysUntil(s.examDate))} days remaining</small>
      </div>;
    })}</div>
  </div>;
}

function PlannerPage({ plan, onSession, onFocus }) {
  return <div className="page">
    <div className="page-intro"><div><div className="eyebrow">ADAPTIVE ENGINE</div><h1>Today's timetable.</h1><p>Sessions are allocated according to the current priority ranking.</p></div></div>
    <section className="panel planner-panel full">
      {plan.map(item => <PlanItem key={item.id} item={item} onSession={onSession} onFocus={onFocus} />)}
      {!plan.length && <EmptyState text="No plan yet. Add subjects and available hours." />}
    </section>
    <div className="recovery-note"><span>↻</span><div><strong>Missed-session recovery</strong><p>If you mark a session as missed, StudyAI records it and the next plan can give more weight to that subject.</p></div></div>
  </div>;
}

function Analytics({ subjects, plan, averageConfidence }) {
  const max = Math.max(...subjects.map(s => calculatePriority(s)), 1);
  return <div className="page">
    <div className="page-intro"><div><div className="eyebrow">PERFORMANCE</div><h1>Learning analytics.</h1><p>Understand where your time and attention should go.</p></div></div>
    <div className="analytics-grid">
      <div className="panel"><h2>Priority distribution</h2><div className="bars">{subjects.map(s => <div className="bar-row" key={s.id}><span>{s.name}</span><div><i style={{width:`${(calculatePriority(s)/max)*100}%`}}></i></div><b>{calculatePriority(s)}</b></div>)}</div></div>
      <div className="panel big-metric"><span>Average confidence</span><strong>{averageConfidence}%</strong><small>Across {subjects.length} subjects</small><div className="metric-ring" style={{"--v":`${averageConfidence * 3.6}deg`}}></div></div>
    </div>
    <div className="panel"><h2>Today's allocation</h2><p className="muted">The planner allocated {formatMinutes(plan.reduce((a,x)=>a+x.minutes,0))} across {plan.length} focus blocks.</p></div>
  </div>;
}

function Coach({ ranked, profile, plan }) {
  const top = ranked[0];
  const messages = [
    top ? `Start with ${top.name}. Its current priority is ${top.priority}/100, so it has the strongest reason to receive your attention today.` : "Add your subjects and I’ll turn them into a study strategy.",
    profile.hours <= 2 ? "Your available time is limited. Keep blocks focused and protect the highest-priority subject first." : "You have enough daily time to use focused blocks plus a short revision session.",
    plan.some(x => x.missed) ? "A session was missed. Don’t restart the whole timetable—recover that block gradually and continue with the next priority." : "No missed sessions recorded today. Keep the streak going."
  ];
  return <div className="page">
    <div className="page-intro"><div><div className="eyebrow">INTELLIGENT ASSISTANT</div><h1>AI Coach.</h1><p>Simple guidance generated from your current study data.</p></div></div>
    <div className="coach-hero"><div className="coach-orb">✦</div><div><div className="eyebrow">STUDYAI COACH</div><h2>Your plan should feel achievable, not overwhelming.</h2><p>I look at urgency, difficulty, confidence and your available time to suggest what deserves attention first.</p></div></div>
    <div className="coach-grid">{messages.map((m,i)=><div className="coach-card" key={i}><span>0{i+1}</span><p>{m}</p></div>)}</div>
  </div>;
}

function coachMessage(ranked, profile, plan) {
  if (!ranked.length) return "Add your subjects and I’ll build your first adaptive plan.";
  const top = ranked[0];
  if (plan.some(x => x.missed)) return `You missed a session. Keep calm — ${top.name} is still your top priority, and recovery can happen without rebuilding everything.`;
  if (top.confidence < 45) return `${top.name} is your biggest confidence gap. Give it your first focused block while your energy is high.`;
  if (daysUntil(top.examDate) <= 3) return `${top.name} has an exam very soon. Prioritize active recall and practice questions today.`;
  return `${top.name} is currently your highest-priority subject. Start there, then move down the ranking.`;
}

function FocusMode({ subject, onClose }) {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running || seconds <= 0) return;
    const timer = setInterval(() => setSeconds(s => s - 1), 1000);
    return () => clearInterval(timer);
  }, [running, seconds]);

  const min = String(Math.floor(seconds / 60)).padStart(2, "0");
  const sec = String(seconds % 60).padStart(2, "0");

  return <div className="modal-backdrop">
    <div className="focus-modal">
      <button className="modal-close" onClick={onClose}>×</button>
      <div className="eyebrow">FOCUS MODE</div>
      <h1>{subject}</h1>
      <div className="timer">{min}:{sec}</div>
      <p>25-minute deep-work block. Keep distractions away.</p>
      <div className="timer-actions"><button className="primary-btn" onClick={() => setRunning(!running)}>{running ? "Pause" : "Start focus"} <span>{running ? "Ⅱ" : "▶"}</span></button><button className="secondary-btn" onClick={() => setSeconds(25*60)}>Reset</button></div>
    </div>
  </div>;
}

export default App;
