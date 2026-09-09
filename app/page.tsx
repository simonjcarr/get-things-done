import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bus,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Clock3,
  FileText,
  LayoutGrid,
  Mail,
  MapPin,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sprout,
  Target,
  Users,
  Waypoints,
  X,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Project, Draft, demoProjects, newProject } from '@/lib/project';
const money = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    n,
  );
const tone = (s: string) =>
  s.toLowerCase().includes('approval')
    ? 'amber'
    : s.includes('Waiting')
      ? 'violet'
      : s === 'Researching'
        ? 'blue'
        : s === 'Completed'
          ? 'green'
          : 'grey';
function Status({ value }: { value: string }) {
  return (
    <span className={'status ' + tone(value)}>
      <i />
      {value}
    </span>
  );
}
function ProjectIcon({ p }: { p: Project }) {
  const Icon =
    p.category === 'Transport'
      ? Bus
      : p.category === 'Environment'
        ? Sprout
        : MapPin;
  return (
    <span
      className={
        'project-icon ' +
        (p.category === 'Transport'
          ? 'violet'
          : p.category === 'Environment'
            ? 'green'
            : 'blue')
      }
    >
      <Icon size={22} />
    </span>
  );
}
export default function Home() {
  const [examples, setExamples] = useState<Project[]>(demoProjects),
    [live, setLive] = useState<Project[]>([]),
    [mode, setMode] = useState('demo'),
    [view, setView] = useState('Projects'),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState('Overview'),
    [filter, setFilter] = useState('Active'),
    [query, setQuery] = useState(''),
    [creating, setCreating] = useState(false),
    [objective, setObjective] = useState(''),
    [review, setReview] = useState<{ p: Project; d: Draft } | null>(null),
    [editing, setEditing] = useState(false),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [login, setLogin] = useState(false),
    [password, setPassword] = useState(''),
    [authenticated, setAuthenticated] = useState(false),
    [ready, setReady] = useState<Record<string, boolean>>({}),
    [inbox, setInbox] = useState<any[]>([]),
    [diagnostics, setDiagnostics] = useState<any[]>([]);
  async function api(path: string, body?: unknown, method?: string) {
    const res = await fetch('/api' + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = (await res.json()) as any;
    if (!res.ok) throw new Error(d.detail || d.error || 'Request failed');
    return d;
  }
  async function refresh() {
    try {
      const d = await api('/projects');
      setLive(d.projects);
      setAuthenticated(true);
      const c = await api('/status');
      setReady(c);
      setInbox((await api('/inbox')).messages);
      setDiagnostics((await api('/diagnostics')).jobs);
    } catch {}
  }
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bob-examples-v1');
      if (saved) setExamples(JSON.parse(saved));
    } catch {}
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(''), 7000);
      return () => clearTimeout(id);
    }
  }, [notice]);
  const projects = mode === 'demo' ? examples : live,
    p = projects.find((p) => p.id === selected),
    approvals = projects.flatMap((p) =>
      p.drafts.filter((d) => d.status === 'Pending').map((d) => ({ p, d })),
    ),
    events = projects
      .flatMap((p) =>
        p.events.map((e) => ({ ...e, project: p.title, pid: p.id })),
      )
      .sort((a, b) => b.at.localeCompare(a.at));
  function nav(v: string) {
    setView(v);
    setSelected(null);
  }
  function open(id: string) {
    setSelected(id);
    setView('Projects');
    setTab('Overview');
  }
  function demoSave(next: Project[]) {
    setExamples(next);
    localStorage.setItem('bob-examples-v1', JSON.stringify(next));
  }
  async function command(project: Project, action: string, extra = {}) {
    try {
      if (mode === 'demo') {
        const status =
          action === 'pause'
            ? 'Paused'
            : action === 'close'
              ? 'Closed'
              : 'Needs setup';
        demoSave(
          examples.map((p) => (p.id === project.id ? { ...p, status } : p)),
        );
      } else {
        await api('/projects/' + project.id + '/commands', {
          action,
          ...extra,
        });
        await refresh();
      }
    } catch (e) {
      setNotice(String(e));
    }
  }
  async function create() {
    setBusy(true);
    try {
      if (mode === 'demo') {
        const n = { ...newProject(objective.trim()), demo: true };
        demoSave([n, ...examples]);
        open(n.id);
      } else {
        const d = await api('/projects', { objective: objective.trim() });
        setLive([d.project, ...live]);
        open(d.project.id);
      }
      setCreating(false);
      setObjective('');
      setNotice(
        mode === 'demo'
          ? 'Example saved in this browser. No real-world actions were taken.'
          : 'Project saved. Bob will investigate when providers are ready.',
      );
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function draftAction(action: string) {
    if (!review) return;
    setBusy(true);
    try {
      if (mode === 'demo') {
        if (action === 'approve')
          throw new Error('Example emails cannot be sent.');
        if (action === 'rewrite')
          throw new Error(
            'Switch to your connected workspace to ask Bob to rewrite.',
          );
        const status = action === 'reject' ? 'Rejected' : 'Pending';
        demoSave(
          examples.map((p) =>
            p.id === review.p.id
              ? {
                  ...p,
                  drafts: p.drafts.map((d) =>
                    d.id === review.d.id
                      ? { ...review.d, status, version: d.version + 1 }
                      : d,
                  ),
                  events: [
                    {
                      id: crypto.randomUUID(),
                      title:
                        action === 'reject'
                          ? 'Draft rejected'
                          : 'Draft updated',
                      detail: 'Example action. No email sent.',
                      at: new Date().toISOString(),
                      kind: 'approval',
                    },
                    ...p.events,
                  ],
                }
              : p,
          ),
        );
      } else {
        await api(`/projects/${review.p.id}/drafts/${review.d.id}/${action}`, {
          version: review.d.version,
          ...(action === 'edit'
            ? {
                to: review.d.to,
                cc: review.d.cc,
                subject: review.d.subject,
                body: review.d.body,
              }
            : {}),
        });
        await refresh();
      }
      setReview(null);
      setNotice(
        action === 'approve'
          ? 'Exact draft approved and queued for delivery.'
          : action === 'rewrite'
            ? 'Rewrite requested. A revised draft will need fresh approval.'
            : 'Draft updated.',
      );
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  }
  function Timeline({ limit = 20 }: { limit?: number }) {
    const rows = p
      ? p.events.map((e) => ({ ...e, project: p.title, pid: p.id }))
      : events;
    return (
      <div className="timeline">
        {rows.slice(0, limit).map((e) => (
          <div className="timeline-item" key={e.id}>
            <span
              className={
                'event-icon ' +
                (e.kind === 'approval'
                  ? 'amber'
                  : e.kind === 'strategy'
                    ? 'blue'
                    : 'grey')
              }
            >
              {e.kind === 'approval' ? (
                <Mail size={15} />
              ) : (
                <CircleCheck size={15} />
              )}
            </span>
            <div>
              <strong>{e.title}</strong>
              <p>{e.detail}</p>
              {!p && (
                <button className="text-link" onClick={() => open(e.pid)}>
                  {e.project}
                </button>
              )}
            </div>
            <time>
              {new Date(e.at).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </div>
        ))}
        {!rows.length && (
          <p className="empty">
            Activity will appear as Bob works on your projects.
          </p>
        )}
      </div>
    );
  }
  function Approval({ item }: { item: { p: Project; d: Draft } }) {
    return (
      <div className="approval-row">
        <span className="project-icon amber">
          <Mail size={20} />
        </span>
        <div>
          <span className="eyebrow">PROPOSED EMAIL</span>
          <h3>{item.d.subject}</h3>
          <p>{item.d.rationale}</p>
          <span className="small muted">{item.p.title}</span>
        </div>
        <button
          className="button outline"
          onClick={() => {
            setReview(item);
            setEditing(false);
          }}
        >
          Review draft <ArrowUpRight size={15} />
        </button>
      </div>
    );
  }
  function Empty({
    title,
    description,
    icon: Icon = FileText,
  }: {
    title: string;
    description: string;
    icon?: typeof FileText;
  }) {
    return (
      <div className="empty-state">
        <Icon size={32} />
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    );
  }
  const filtered = projects.filter(
    (p) =>
      (filter === 'All' ||
        (filter === 'Active' &&
          !['Closed', 'Completed', 'Cancelled'].includes(p.status)) ||
        (filter === 'Completed' && p.status === 'Completed')) &&
      `${p.title} ${p.objective}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '238px' } as React.CSSProperties}
    >
      <Sidebar>
        <SidebarHeader>
          <button className="brand" onClick={() => nav('Projects')}>
            <span className="bob-mark">b</span>bob<span>.</span>
          </button>
          <div className="workspace-label">SIMON’S WORKSPACE</div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {[
              { name: 'Projects', icon: LayoutGrid },
              { name: 'Approvals', icon: CheckCheck },
              { name: 'Activity', icon: Activity },
              { name: 'Inbox', icon: Mail },
            ].map(({ name, icon: Icon }) => (
              <SidebarMenuItem key={name}>
                <SidebarMenuButton
                  className="nav-item"
                  isActive={view === name}
                  onClick={() => nav(name)}
                >
                  <Icon />
                  <span>{name}</span>
                  {name === 'Approvals' && approvals.length > 0 && (
                    <span className="nav-count">{approvals.length}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="sidebar-divider" />
          <div className="workspace-label side-label">
            YOUR PROJECTS
            <button aria-label="New project" onClick={() => setCreating(true)}>
              <Plus size={14} />
            </button>
          </div>
          <div className="mini-projects">
            {projects.slice(0, 5).map((p) => (
              <button key={p.id} onClick={() => open(p.id)}>
                <i className={tone(p.status)} />
                <span>{p.title}</span>
              </button>
            ))}
          </div>
          <div className="autonomy-note">
            <strong>
              <ShieldCheck size={17} /> You’re in control
            </strong>
            <p>
              Bob does the groundwork.
              <br />
              You approve external actions.
            </p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenuButton
            className="nav-item"
            isActive={view === 'Settings'}
            onClick={() => nav('Settings')}
          >
            <Settings />
            Settings & connections
          </SidebarMenuButton>
          <div className="profile">
            <span className="avatar">SC</span>
            <div>
              <strong>Simon Carr</strong>
              <p>Personal workspace</p>
            </div>
            <ShieldCheck size={16} />
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-trigger" />
            Workspace <ChevronRight size={14} />
            <strong>{p ? p.title : view}</strong>
          </div>
          <div className="top-actions">
            <span className="mode-label">
              <i />
              {mode === 'demo' ? 'Example workspace' : 'Personal workspace'}
            </span>
            <button
              className="icon-button"
              aria-label="View approvals"
              onClick={() => nav('Approvals')}
            >
              <Bell size={19} />
              {approvals.length > 0 && <i />}
            </button>
          </div>
        </header>
        <div className="page-body">
          <div className="mode-banner">
            <span>
              <b>{mode === 'demo' ? 'EXAMPLE' : 'LIVE'}</b>
              {mode === 'demo'
                ? 'Explore how Bob works. Activity, research and costs are illustrative.'
                : 'Your private projects. All external correspondence requires approval.'}
            </span>
            <button
              onClick={() => {
                setMode(mode === 'demo' ? 'live' : 'demo');
                setSelected(null);
                if (mode === 'demo' && !authenticated) setLogin(true);
              }}
            >
              {mode === 'demo' ? 'My workspace' : 'View example'}
              <ArrowRight size={14} />
            </button>
          </div>
          {p ? (
            <>
              <button className="back-link" onClick={() => setSelected(null)}>
                <ArrowLeft size={15} /> All projects
              </button>
              <div className="page-heading">
                <div className="project-title">
                  <ProjectIcon p={p} />
                  <div>
                    <span className="eyebrow">{p.category}</span>
                    <h1>{p.title}</h1>
                  </div>
                </div>
                <Status value={p.status} />
              </div>
              <p className="project-objective">{p.objective}</p>
              <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
                <TabsList variant="line" className="project-tabs">
                  {[
                    'Overview',
                    'Plan',
                    'Activity',
                    'Research',
                    'Stakeholders',
                    'Emails',
                    'Approvals',
                    'Documents',
                    'Costs',
                    'Settings',
                  ].map((t) => (
                    <TabsTrigger value={t} key={t}>
                      {t}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="Overview">
                  <div className="detail-grid">
                    <section className="panel">
                      <div className="panel-title">
                        <Waypoints size={20} />
                        <h2>Current strategy</h2>
                      </div>
                      <p className="strategy-text">{p.strategy}</p>
                      <div className="next-action">
                        <span className="eyebrow">NEXT BEST ACTION</span>
                        <p>
                          <ArrowRight size={17} />
                          {p.next}
                        </p>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-title">
                        <Target size={20} />
                        <h2>Success looks like</h2>
                      </div>
                      <p>{p.success}</p>
                      <div className="cost-line">
                        <span>Total AI cost</span>
                        <strong>{money(p.cost)}</strong>
                      </div>
                    </section>
                    <section className="panel">
                      <h2>Current understanding</h2>
                      <p>{p.understanding}</p>
                      <span className="inline-note">
                        <ShieldCheck size={15} /> Facts, inferences and
                        assumptions stay distinct.
                      </span>
                    </section>
                    <section className="panel">
                      <h2>Needs your attention</h2>
                      <p>
                        {p.drafts.some((d) => d.status === 'Pending')
                          ? 'A proposed email is waiting for your review.'
                          : 'No approvals are waiting for you.'}
                      </p>
                      {p.drafts.some((d) => d.status === 'Pending') && (
                        <button
                          className="button primary spaced"
                          onClick={() => {
                            setReview({
                              p,
                              d: p.drafts.find((d) => d.status === 'Pending')!,
                            });
                            setEditing(false);
                          }}
                        >
                          Review draft
                          <ArrowRight size={16} />
                        </button>
                      )}
                    </section>
                  </div>
                  <section className="panel spaced">
                    <div className="section-header">
                      <h2>Recent activity</h2>
                      <button
                        className="text-link"
                        onClick={() => setTab('Activity')}
                      >
                        View all <ArrowRight size={14} />
                      </button>
                    </div>
                    <Timeline limit={4} />
                  </section>
                </TabsContent>
                <TabsContent value="Plan">
                  <section className="panel">
                    <h2>A living plan</h2>
                    <p>
                      Sequenced around the objective. Revised as new evidence
                      arrives.
                    </p>
                    {p.actions.map((a, i) => (
                      <div className="plan-row" key={a.id}>
                        <span className="step">
                          {a.status === 'Completed' ? (
                            <Check size={17} />
                          ) : (
                            i + 1
                          )}
                        </span>
                        <div>
                          <h3>{a.title}</h3>
                          <p>{a.detail}</p>
                          <span className="small muted">
                            Priority: {a.priority}
                          </span>
                        </div>
                        <Status value={a.status} />
                      </div>
                    ))}
                  </section>
                </TabsContent>
                <TabsContent value="Activity">
                  <section className="panel">
                    <h2>Activity & decisions</h2>
                    <Timeline />
                  </section>
                </TabsContent>
                <TabsContent value="Research">
                  <section className="panel">
                    <h2>Research library</h2>
                    {p.research.length ? (
                      p.research.map((r) => (
                        <div className="research-row" key={r.url}>
                          <h3>{r.title}</h3>
                          <p>{r.excerpt}</p>
                          <span className="tag">{r.confidence}</span>
                          <a
                            className="text-link"
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open source <ArrowUpRight size={15} />
                          </a>
                        </div>
                      ))
                    ) : (
                      <Empty
                        icon={Search}
                        title="No verified sources yet"
                        description="Bob will record source links, relevant information, confidence and what it means for the strategy here."
                      />
                    )}
                  </section>
                </TabsContent>
                <TabsContent value="Stakeholders">
                  <section className="panel">
                    <h2>People who can make a difference</h2>
                    <div className="stakeholders">
                      {p.stakeholders.map((s) => (
                        <div className="stakeholder" key={s.name}>
                          <Users size={25} />
                          <span className="eyebrow">{s.role}</span>
                          <h3>{s.name}</h3>
                          <span className="tag">{s.position}</span>
                        </div>
                      ))}
                    </div>
                    {!p.stakeholders.length && (
                      <Empty
                        icon={Users}
                        title="No stakeholders identified yet"
                        description="Research will identify who has authority, influence or useful expertise."
                      />
                    )}
                  </section>
                </TabsContent>
                <TabsContent value="Emails">
                  <section className="panel">
                    <h2>Correspondence</h2>
                    {p.drafts.map((d) => (
                      <div className="email-row" key={d.id}>
                        <Mail size={20} />
                        <div>
                          <h3>{d.subject}</h3>
                          <p>{d.to || 'Recipient not yet verified'}</p>
                        </div>
                        <span className="tag">{d.status}</span>
                        <button
                          className="text-link"
                          onClick={() => {
                            setReview({ p, d });
                            setEditing(false);
                          }}
                        >
                          View
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    ))}
                    {(p.emails || []).map((m) => (
                      <details className="email-row" key={m.id}>
                        <summary>
                          {m.direction === 'incoming' ? 'Received' : 'Outgoing'}{' '}
                          · {m.subject} · {m.state}
                        </summary>
                        <p>{m.sender}</p>
                        <pre className="mail-text">{m.body}</pre>
                      </details>
                    ))}
                    {!p.drafts.length && !p.emails?.length && (
                      <Empty
                        icon={Mail}
                        title="No correspondence yet"
                        description="Drafts and their delivery status will appear here. Replies are recorded in project activity."
                      />
                    )}
                  </section>
                </TabsContent>
                <TabsContent value="Approvals">
                  <section className="panel">
                    {approvals
                      .filter((a) => a.p.id === p.id)
                      .map((a) => (
                        <Approval key={a.d.id} item={a} />
                      ))}
                    {!approvals.some((a) => a.p.id === p.id) && (
                      <Empty
                        icon={CheckCheck}
                        title="You’re all caught up"
                        description="Proposed external actions will appear here before execution."
                      />
                    )}
                  </section>
                </TabsContent>
                <TabsContent value="Documents">
                  <section className="panel">
                    <Empty
                      title="No documents yet"
                      description="Internal evidence summaries will stay with the project. Incoming attachments are quarantined and never opened automatically."
                    />
                  </section>
                </TabsContent>
                <TabsContent value="Costs">
                  <section className="panel">
                    <div className="section-header">
                      <h2>AI usage & costs</h2>
                      <strong className="large-cost">{money(p.cost)}</strong>
                    </div>
                    <p>
                      {p.demo
                        ? 'Illustrative total only. No model calls were made for this example.'
                        : 'Estimated from recorded token usage and configured pricing.'}
                    </p>
                    {[
                      'research',
                      'strategy',
                      'critic',
                      'inbox',
                      'correspondence',
                    ].map((s) => (
                      <div className="cost-line" key={s}>
                        <span>{s}</span>
                        <span>
                          {p.demo
                            ? 'Example total only'
                            : money(
                                (p.modelCalls || [])
                                  .filter((c) => c.role === s)
                                  .reduce((a, c) => a + c.cost, 0),
                              )}
                        </span>
                      </div>
                    ))}
                    <button
                      className="button outline"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(p, null, 2)], {
                            type: 'application/json',
                          }),
                          url = URL.createObjectURL(blob),
                          a = document.createElement('a');
                        a.href = url;
                        a.download = 'bob-project.json';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Export project records
                    </button>
                  </section>
                </TabsContent>
                <TabsContent value="Settings">
                  <section className="panel">
                    <h2>Project controls</h2>
                    <p>
                      Pause work, request a reassessment, or explicitly close
                      the objective.
                    </p>
                    <div className="button-row">
                      <button
                        className="button outline"
                        onClick={() =>
                          command(p, p.status === 'Paused' ? 'resume' : 'pause')
                        }
                      >
                        {p.status === 'Paused' ? (
                          <Play size={16} />
                        ) : (
                          <Pause size={16} />
                        )}{' '}
                        {p.status === 'Paused' ? 'Resume' : 'Pause'}
                      </button>
                      <button
                        className="button outline"
                        onClick={() => command(p, 'reassess')}
                      >
                        Reassess
                      </button>
                      <button
                        className="button outline"
                        onClick={() => command(p, 'close')}
                      >
                        Close project
                      </button>
                    </div>
                  </section>
                </TabsContent>
              </Tabs>
            </>
          ) : view === 'Projects' ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow greeting">
                    YOUR OBJECTIVES, MOVING FORWARD
                  </span>
                  <h1>A little progress. A bigger difference.</h1>
                  <p>Here’s where things stand, Simon.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={18} />
                  New project
                </button>
              </div>
              <div className="stats-grid">
                {[
                  {
                    title: 'Active projects',
                    icon: LayoutGrid,
                    value: projects.filter(
                      (p) =>
                        !['Closed', 'Completed', 'Cancelled'].includes(
                          p.status,
                        ),
                    ).length,
                    note: 'objectives in motion',
                  },
                  {
                    title: 'Needs your approval',
                    icon: CheckCheck,
                    value: approvals.length,
                    note: approvals.length
                      ? 'ready for your review'
                      : 'all clear',
                  },
                  {
                    title: 'Waiting for a response',
                    icon: Clock3,
                    value: projects.filter(
                      (p) => p.status === 'Waiting for response',
                    ).length,
                    note: 'giving people time',
                  },
                  {
                    title: 'Total AI cost',
                    icon: Sparkles,
                    value: money(projects.reduce((a, p) => a + p.cost, 0)),
                    note:
                      mode === 'demo'
                        ? 'illustrative usage'
                        : 'across your projects',
                  },
                ].map(({ title, icon: Icon, value, note }) => (
                  <div className="stat" key={title}>
                    <span>
                      <Icon size={17} />
                      {title}
                    </span>
                    <strong>
                      {value}
                      <small>{note}</small>
                    </strong>
                  </div>
                ))}
              </div>
              {approvals.length > 0 && (
                <div className="attention-strip">
                  <span className="attention-icon">
                    <CheckCheck size={21} />
                  </span>
                  <div>
                    <h3>A quick decision from you. A next step for Bob.</h3>
                    <p>
                      {approvals.length} email{' '}
                      {approvals.length === 1 ? 'draft is' : 'drafts are'}{' '}
                      waiting for your review.
                    </p>
                  </div>
                  <button onClick={() => nav('Approvals')}>
                    Review draft <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <div className="section-header">
                <div className="heading-count">
                  <h2>Your projects</h2>
                  <span>{projects.length}</span>
                </div>
                <div className="project-tools">
                  <div className="filter-tabs">
                    {['Active', 'Completed', 'All'].map((f) => (
                      <button
                        key={f}
                        className={filter === f ? 'active' : ''}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <label className="search-field">
                    <Search size={15} />
                    <input
                      placeholder="Find a project…"
                      aria-label="Search projects"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
              </div>
              <div className="project-grid">
                {filtered.map((p) => (
                  <button
                    className="project-card"
                    key={p.id}
                    onClick={() => open(p.id)}
                  >
                    <div className="card-top">
                      <ProjectIcon p={p} />
                      <Status value={p.status} />
                    </div>
                    <span className="eyebrow">{p.category}</span>
                    <h3>{p.title}</h3>
                    <p className="card-objective">{p.objective}</p>
                    <div className="card-strategy">
                      <span className="eyebrow">CURRENT STRATEGY</span>
                      <p>{p.strategy}</p>
                    </div>
                    <div className="card-next">
                      <span>
                        <ArrowRight size={14} /> NEXT ACTION
                      </span>
                      <p>{p.next}</p>
                    </div>
                    <div className="card-footer">
                      <div>
                        <Progress value={p.progress} className="progress-bar" />
                        <span>{p.progress}% of plan</span>
                      </div>
                      <span>
                        {money(p.cost)}
                        <ArrowUpRight size={15} />
                      </span>
                    </div>
                  </button>
                ))}
                {!filtered.length && (
                  <section className="panel wide">
                    <Empty
                      icon={Target}
                      title={
                        query
                          ? 'No matching projects'
                          : 'What would you like to change?'
                      }
                      description="Give Bob an objective. You don’t need to know the steps yet."
                    />
                  </section>
                )}
              </div>
              <div className="bottom-grid">
                <section className="panel activity-panel">
                  <div className="section-header">
                    <h2>Recent activity</h2>
                    <button
                      className="text-link"
                      onClick={() => nav('Activity')}
                    >
                      View all activity
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <Timeline limit={3} />
                </section>
                <section className="bob-note">
                  <Sparkles size={25} />
                  <h2>A goal is enough to get started.</h2>
                  <p>
                    You don’t need a plan, a contact, or all the answers. Tell
                    Bob what you want to achieve.
                  </p>
                  <button
                    className="text-link"
                    onClick={() => setCreating(true)}
                  >
                    Start something worthwhile
                    <ArrowRight size={15} />
                  </button>
                  <span>
                    <ShieldCheck size={14} />
                    Thoughtful groundwork. Your final say.
                  </span>
                </section>
              </div>
            </>
          ) : view === 'Approvals' ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR FINAL SAY</span>
                  <h1>Needs your approval</h1>
                  <p>Review the details before Bob takes the next step.</p>
                </div>
              </div>
              <section className="panel">
                {approvals.map((a) => (
                  <Approval key={a.d.id} item={a} />
                ))}
                {!approvals.length && (
                  <Empty
                    icon={CheckCheck}
                    title="You’re all caught up"
                    description="Any proposed external action will appear here first."
                  />
                )}
              </section>
              <p className="inline-note">
                <ShieldCheck size={16} />
                Approval applies to the exact content you review. Changed drafts
                need fresh approval.
              </p>
            </>
          ) : view === 'Activity' ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">THE WORK BEHIND THE PROGRESS</span>
                  <h1>Activity & decisions</h1>
                  <p>A clear record of what happened, and why.</p>
                </div>
              </div>
              <section className="panel">
                <Timeline />
              </section>
            </>
          ) : view === 'Inbox' ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">ONE MAILBOX, EVERY PROJECT</span>
                  <h1>Shared inbox</h1>
                  <p>
                    Ambiguous replies stay here while Bob asks the sender to
                    clarify.
                  </p>
                </div>
              </div>
              <section className="panel">
                {mode === 'demo' || !inbox.length ? (
                  <Empty
                    icon={Mail}
                    title="No unassigned messages"
                    description="Bob uses message references to find the right project. If the connection is unclear, a clarification draft comes to your approval queue."
                  />
                ) : (
                  inbox.map((m) => (
                    <div className="inbox-item" key={m.id}>
                      <h3>{m.subject || '(No subject)'}</h3>
                      <p>{m.sender} · Untrusted external email</p>
                      <details>
                        <summary>Read plain-text message</summary>
                        <pre className="mail-text">{m.body}</pre>
                      </details>
                      <div className="button-row">
                        {live
                          .filter((p) => p.id !== 'inbox-clarifications')
                          .map((p) => (
                            <button
                              className="button outline"
                              key={p.id}
                              onClick={async () => {
                                try {
                                  await api('/inbox/' + m.id + '/assign', {
                                    project_id: p.id,
                                  });
                                  await refresh();
                                  setNotice(
                                    'Message associated with the selected project.',
                                  );
                                } catch (e) {
                                  setNotice(String(e));
                                }
                              }}
                            >
                              Assign to {p.title}
                            </button>
                          ))}
                      </div>
                    </div>
                  ))
                )}
              </section>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">WORKSPACE SETTINGS</span>
                  <h1>Make Bob ready for work.</h1>
                  <p>One shared mailbox. Every project keeps its own memory.</p>
                </div>
              </div>
              <div className="settings-grid">
                {[
                  {
                    key: 'ai',
                    icon: Sparkles,
                    title: 'AI provider',
                    body: 'Specialist research, strategy, critic and correspondence roles. Credentials are managed on the server.',
                  },
                  {
                    key: 'search',
                    icon: Search,
                    title: 'Public research',
                    body: 'Source-backed investigation using public search. External content is untrusted data.',
                  },
                  {
                    key: 'smtp',
                    icon: Mail,
                    title: 'Shared SMTP mailbox',
                    body: 'All projects send through Bob’s dedicated account. Every message requires exact-content approval.',
                  },
                  {
                    key: 'imap',
                    icon: Clock3,
                    title: 'Incoming mail & background work',
                    body: 'IMAP checks the shared mailbox. Replies match project threads by message references, never subject alone.',
                  },
                ].map(({ key, icon: Icon, title, body }) => (
                  <section className="panel connection" key={key}>
                    <div>
                      <Icon size={23} />
                      <span className="tag">
                        {ready[key] ? 'Configured' : 'Needs setup'}
                      </span>
                    </div>
                    <h2>{title}</h2>
                    <p>{body}</p>
                    <span className="connection-foot">
                      Configured through the production environment
                    </span>
                  </section>
                ))}
              </div>
              <section className="panel spaced">
                <h2>Identity & permissions</h2>
                <p>
                  Every external message identifies Bob as{' '}
                  <strong>
                    “Bob, the AI-powered assistant of Simon Carr.”
                  </strong>{' '}
                  Credentials never enter project history or model context.
                </p>
                <div className="cost-line">
                  <span>Personal workspace</span>
                  <button
                    className="text-link"
                    onClick={() =>
                      authenticated
                        ? api('/logout', {}).then(() => {
                            setAuthenticated(false);
                            setLive([]);
                            setMode('demo');
                          })
                        : setLogin(true)
                    }
                  >
                    {authenticated ? 'Sign out' : 'Sign in'}
                  </button>
                </div>
                <div className="cost-line">
                  <span>Example workspace</span>
                  <button
                    className="text-link"
                    onClick={() => {
                      demoSave(demoProjects);
                      setNotice('Example workspace reset.');
                    }}
                  >
                    Reset example
                  </button>
                </div>
              </section>
              {authenticated && (
                <section className="panel spaced">
                  <h2>Background job diagnostics</h2>
                  {diagnostics.slice(0, 15).map((j) => (
                    <div className="cost-line" key={j.id}>
                      <span>
                        {j.kind} · {j.state} · {j.attempts} attempts
                      </span>
                      <span>{j.error || 'No errors'}</span>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          <footer className="page-footer">
            <strong>bob.</strong>
            <span>Small steps. Real-world outcomes.</span>
            <span>
              <ShieldCheck size={13} /> External actions always need your
              approval
            </span>
          </footer>
        </div>
      </main>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="bob-dialog">
          <DialogTitle className="dialog-heading">
            What would you like to achieve?
          </DialogTitle>
          <DialogDescription>
            Start with the outcome. Bob’s job is to work out the steps.
          </DialogDescription>
          <label className="field-label" htmlFor="objective">
            Your objective
          </label>
          <textarea
            id="objective"
            rows={5}
            maxLength={4000}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="I think there should be a zebra crossing on Birch Ave outside Sainsbury’s to the kids park on the other side of the road."
          />
          <div className="dialog-note">
            <ShieldCheck size={18} />
            <span>
              {mode === 'demo'
                ? 'This creates an example in this browser. No research or external communication takes place.'
                : 'Bob will investigate and prepare a strategy. Anything requiring your authority comes back for approval.'}
            </span>
          </div>
          <button
            className="button primary"
            disabled={busy || objective.trim().length < 10}
            onClick={create}
          >
            {busy ? 'Saving…' : 'Create project'}
            <ArrowRight size={16} />
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!review}
        onOpenChange={(o) => {
          if (!o) setReview(null);
        }}
      >
        <DialogContent className="bob-dialog review-dialog">
          <DialogTitle className="dialog-heading">
            Review email draft
          </DialogTitle>
          <DialogDescription>
            {review?.p.title} ·{' '}
            {mode === 'demo'
              ? 'Example correspondence'
              : 'Proposed correspondence'}
          </DialogDescription>
          {review && (
            <>
              <div className="review-reason">
                <span className="eyebrow">WHY BOB RECOMMENDS THIS</span>
                <p>{review.d.rationale}</p>
                <span className="small">
                  Intended outcome: {review.d.outcome}
                </span>
              </div>
              {(['to', 'cc', 'subject'] as const).map((k) => (
                <label className="email-field" key={k}>
                  <span>
                    {k === 'to' ? 'To' : k === 'cc' ? 'CC' : 'Subject'}
                  </span>
                  <input
                    readOnly={!editing}
                    value={review.d[k]}
                    placeholder={
                      k === 'to'
                        ? 'Recipient needs verification'
                        : k === 'cc'
                          ? 'None'
                          : ''
                    }
                    onChange={(e) =>
                      setReview({
                        ...review,
                        d: { ...review.d, [k]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
              <textarea
                className="email-body"
                aria-label="Email body"
                rows={12}
                readOnly={!editing}
                value={review.d.body}
                onChange={(e) =>
                  setReview({
                    ...review,
                    d: { ...review.d, body: e.target.value },
                  })
                }
              />
              <p className="inline-note">
                <ShieldCheck size={15} />
                {mode === 'demo'
                  ? 'Example emails cannot be sent.'
                  : 'Approval locks the exact message and recipients displayed above.'}
              </p>
              <div className="review-actions">
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => draftAction('reject')}
                >
                  Reject
                </button>
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() =>
                    editing ? draftAction('edit') : setEditing(true)
                  }
                >
                  {editing ? 'Save changes' : 'Edit'}
                </button>
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => draftAction('rewrite')}
                >
                  Ask Bob to rewrite
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    mode === 'demo' ||
                    editing ||
                    review.d.status !== 'Pending' ||
                    !review.d.to ||
                    !ready.smtp
                  }
                  onClick={() => draftAction('approve')}
                >
                  Approve & Send
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={login} onOpenChange={setLogin}>
        <DialogContent className="bob-dialog">
          <DialogTitle className="dialog-heading">
            Your private workspace
          </DialogTitle>
          <DialogDescription>
            Sign in with the password configured for Bob on your server.
          </DialogDescription>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api('/login', { password });
                setPassword('');
                setLogin(false);
                setAuthenticated(true);
                setMode('live');
                await refresh();
              } catch (e) {
                setNotice(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="login-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="button primary spaced"
              disabled={busy || !password}
            >
              Sign in <ArrowRight size={16} />
            </button>
          </form>
        </DialogContent>
      </Dialog>
      {notice && (
        <div className="toast" role="status">
          <CircleCheck size={19} />
          <span>{notice}</span>
          <button aria-label="Dismiss" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </SidebarProvider>
  );
}
