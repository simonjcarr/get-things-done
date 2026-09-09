export type Event = {
  id: string;
  title: string;
  detail: string;
  at: string;
  kind: string;
};
export type Action = {
  id: string;
  title: string;
  detail: string;
  status: string;
  priority: string;
};
export type Draft = {
  id: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  rationale: string;
  outcome: string;
  status: string;
  version: number;
  hash?: string;
};
export type Project = {
  modelCalls?: {
    role: string;
    model: string;
    cost: number;
    input_tokens: number;
    output_tokens: number;
  }[];
  emails?: {
    id: string;
    sender: string;
    subject: string;
    body: string;
    direction: string;
    state: string;
    at: number;
  }[];
  id: string;
  title: string;
  objective: string;
  status: string;
  category: string;
  strategy: string;
  understanding: string;
  success: string;
  next: string;
  progress: number;
  cost: number;
  createdAt: string;
  actions: Action[];
  events: Event[];
  drafts: Draft[];
  research: {
    title: string;
    url: string;
    excerpt: string;
    confidence: string;
  }[];
  stakeholders: { name: string; role: string; position: string }[];
  demo?: boolean;
};
export function newProject(objective: string): Project {
  const id = crypto.randomUUID(),
    at = new Date().toISOString();
  return {
    id,
    title: objective.length > 72 ? objective.slice(0, 69) + '…' : objective,
    objective,
    status: 'Needs setup',
    category: 'New objective',
    strategy:
      'First verify the context, identify who can influence the outcome, and establish the evidence needed. Research must be connected before this strategy can be developed.',
    understanding:
      'Your objective is saved. The relevant facts and responsible organisations have not yet been verified.',
    success: 'To be defined after investigating the objective.',
    next: 'Connect research and AI services to begin investigation.',
    progress: 0,
    cost: 0,
    createdAt: at,
    actions: [
      {
        id: crypto.randomUUID(),
        title: 'Investigate the objective',
        detail:
          'Resolve location and context from public sources, identify responsible stakeholders, and record evidence with source URLs.',
        status: 'Proposed',
        priority: 'High',
      },
      {
        id: crypto.randomUUID(),
        title: 'Develop and challenge the strategy',
        detail:
          'Use verified evidence to propose a plan and review its assumptions before contacting anyone.',
        status: 'Proposed',
        priority: 'High',
      },
    ],
    events: [
      {
        id: crypto.randomUUID(),
        title: 'Project created',
        detail: 'Objective saved. Investigation is waiting for provider setup.',
        at,
        kind: 'project',
      },
    ],
    drafts: [],
    research: [],
    stakeholders: [],
  };
}
export const demoProjects: Project[] = [
  {
    ...newProject(
      'Make it safer to cross Birch Avenue between Sainsbury’s and the children’s park.',
    ),
    id: 'demo-crossing',
    title: 'A safer crossing on Birch Avenue',
    status: 'Needs approval',
    category: 'Community & safety',
    strategy:
      'Build an evidence-led case for a pedestrian crossing. Establish the assessment process first, then gather the evidence the highways team needs.',
    understanding:
      'The road, shop and park need to be verified. This example illustrates how Bob would build a road-safety case, without claiming that research has taken place.',
    success:
      'An appropriate safe crossing is installed and open to pedestrians.',
    next: 'Review the draft enquiry about the crossing assessment process.',
    progress: 28,
    cost: 2.37,
    demo: true,
    actions: [
      {
        id: 'a1',
        title: 'Confirm the location and highway authority',
        detail:
          'Verify the crossing location and which council is responsible. Example milestone only.',
        status: 'Completed',
        priority: 'High',
      },
      {
        id: 'a2',
        title: 'Ask about crossing assessment criteria',
        detail:
          'Find out what evidence is required before investing in surveys or a petition.',
        status: 'Waiting for Approval',
        priority: 'High',
      },
      {
        id: 'a3',
        title: 'Build the road-safety evidence base',
        detail:
          'Gather pedestrian routes, accessibility needs and public collision data once the assessment criteria are known.',
        status: 'Proposed',
        priority: 'High',
      },
      {
        id: 'a4',
        title: 'Identify local supporters',
        detail:
          'Explore schools, residents and accessibility groups. Contact requires approval.',
        status: 'Proposed',
        priority: 'Medium',
      },
    ],
    events: [
      {
        id: 'e1',
        title: 'Draft ready for your review',
        detail:
          'An enquiry about assessment criteria is the next proposed step.',
        at: '2026-09-09T14:20:00Z',
        kind: 'approval',
      },
      {
        id: 'e2',
        title: 'An evidence-first strategy',
        detail:
          'The example plan prioritises understanding the process before seeking wider support.',
        at: '2026-09-09T14:15:00Z',
        kind: 'strategy',
      },
      {
        id: 'e3',
        title: 'Project objective captured',
        detail: 'A safer pedestrian route between the shop and the park.',
        at: '2026-09-09T14:03:00Z',
        kind: 'project',
      },
    ],
    drafts: [
      {
        id: 'd1',
        to: '',
        cc: '',
        subject: 'Pedestrian crossing assessment — Birch Avenue, Penwortham',
        body: 'Hello,\n\nMy name is Bob. I am the AI-powered assistant of Simon Carr, and I am helping Simon investigate safer pedestrian access on Birch Avenue, between Sainsbury’s and the children’s park.\n\nCould you please confirm whether your team is responsible for this location and explain the process for requesting a pedestrian crossing assessment? It would be helpful to understand the criteria you use and the evidence residents should provide.\n\nIf another team is responsible, I would appreciate being directed to the appropriate contact.\n\nKind regards,\nBob, the AI-powered assistant of Simon Carr.',
        rationale:
          'Establish the formal process and evidence requirements before gathering supporting material. The recipient address still needs verification.',
        outcome:
          'A confirmed point of contact and a clear set of assessment criteria.',
        status: 'Pending',
        version: 1,
      },
    ],
    research: [],
    stakeholders: [
      {
        name: 'Highway authority',
        role: 'Decision maker',
        position: 'To verify',
      },
      {
        name: 'Local residents',
        role: 'Potential supporters',
        position: 'Not contacted',
      },
      {
        name: 'Local accessibility groups',
        role: 'Subject matter experts',
        position: 'To identify',
      },
    ],
  },
  {
    ...newProject('Improve the reliability of the local bus service.'),
    id: 'demo-bus',
    title: 'A more reliable local bus service',
    category: 'Transport',
    status: 'Waiting for response',
    strategy:
      'Understand the service reliability data before proposing a timetable review.',
    next: 'Review the situation on 17 September. Avoid unnecessary follow-ups.',
    progress: 45,
    cost: 1.12,
    demo: true,
    events: [
      {
        id: 'bus1',
        title: 'Waiting period scheduled',
        detail: 'Example waiting state until 17 September.',
        at: '2026-09-09T11:42:00Z',
        kind: 'waiting',
      },
    ],
  },
  {
    ...newProject('Find a practical route to more trees in the neighbourhood.'),
    id: 'demo-trees',
    title: 'More trees, greener neighbourhood',
    category: 'Environment',
    status: 'Researching',
    strategy:
      'Identify suitable public land and understand available community planting schemes.',
    next: 'Identify the landowner and check eligibility for planting support.',
    progress: 12,
    cost: 0.64,
    demo: true,
    events: [
      {
        id: 'tree1',
        title: 'Investigation planned',
        detail:
          'Example research task: identify ownership and planting constraints.',
        at: '2026-09-09T09:30:00Z',
        kind: 'research',
      },
    ],
  },
];
