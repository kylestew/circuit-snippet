import type { CircuitData, Netlist, NetlistNode, NetlistComponent } from '../components/types.js';

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra;
    } else {
      this.parent[rb] = ra;
      this.rank[ra]++;
    }
  }
}

function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function buildNetlist(data: CircuitData): Netlist {
  const coordToId = new Map<string, number>();
  let nextId = 0;

  function getNodeId(x: number, y: number): number {
    const key = coordKey(x, y);
    let id = coordToId.get(key);
    if (id === undefined) {
      id = nextId++;
      coordToId.set(key, id);
    }
    return id;
  }

  const oneTerminal = new Set(['g', 'O', 'p']);
  for (const comp of data.components) {
    getNodeId(comp.x1, comp.y1);
    if (!oneTerminal.has(comp.type)) {
      getNodeId(comp.x2, comp.y2);
    }
  }

  const uf = new UnionFind(nextId);

  for (const comp of data.components) {
    if (comp.type === 'w') {
      const a = getNodeId(comp.x1, comp.y1);
      const b = getNodeId(comp.x2, comp.y2);
      uf.union(a, b);
    }
  }

  let groundRoot: number | null = null;
  for (const comp of data.components) {
    if (comp.type === 'g') {
      const nodeId = getNodeId(comp.x1, comp.y1);
      if (groundRoot === null) {
        groundRoot = uf.find(nodeId);
      } else {
        uf.union(groundRoot, nodeId);
      }
    }
  }

  if (groundRoot === null) {
    throw new Error('Circuit has no ground node');
  }

  const rootToCompact = new Map<number, number>();
  rootToCompact.set(uf.find(groundRoot), 0);
  let compactNext = 1;

  for (let i = 0; i < nextId; i++) {
    const root = uf.find(i);
    if (!rootToCompact.has(root)) {
      rootToCompact.set(root, compactNext++);
    }
  }

  function compactId(rawId: number): number {
    return rootToCompact.get(uf.find(rawId))!;
  }

  const nodes: NetlistNode[] = [];
  const nodeCoords = new Map<number, Array<{ x: number; y: number }>>();
  for (const [key, rawId] of coordToId) {
    const cid = compactId(rawId);
    const [x, y] = key.split(',').map(Number);
    if (!nodeCoords.has(cid)) {
      nodeCoords.set(cid, []);
    }
    nodeCoords.get(cid)!.push({ x, y });
  }
  for (const [id, coords] of nodeCoords) {
    nodes.push({ id, coords });
  }
  nodes.sort((a, b) => a.id - b.id);

  const components: NetlistComponent[] = [];
  for (const comp of data.components) {
    if (comp.type === 'w' || comp.type === 'g') continue;
    const n1 = compactId(getNodeId(comp.x1, comp.y1));
    if (oneTerminal.has(comp.type)) {
      components.push({ component: comp, nodes: [n1] });
    } else {
      const n2 = compactId(getNodeId(comp.x2, comp.y2));
      components.push({ component: comp, nodes: [n1, n2] });
    }
  }

  return { nodes, components, scopes: data.scopes, options: data.options };
}
