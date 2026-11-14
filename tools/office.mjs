#!/usr/bin/env node
// 생태몬스터 AI 오피스 보고 도구 — 게임 저장소에서 Claude Code가 부른다.
// 작업 상황을 `office-status` 가지의 status.json 에만 커밋·푸시한다.
// 지금 작업 폴더·가지·스테이징은 전혀 건드리지 않는다(git 배관 명령만 씀). 의존성 없음, Node 18+.
//
//   node tools/office.mjs report --agent coder --station dev --task "HP바 애니메이션 고치는 중" --progress 0.4
//   node tools/office.mjs report --agent qa --failed --task "세이브 불러오기 실패"
//   node tools/office.mjs report --agent coder --done --task "HP바 완료 · 휴대폰 확인"
//   node tools/office.mjs report --agent haram --say "QA님 1번 도로 확인 부탁해요" --to qa
//   node tools/office.mjs report --agent qa --station test --task "홈 화면 점검" --shot ./shot.png --shot-label "타이틀 화면"
//   node tools/office.mjs report --log "0.5 클로즈베타 배포 완료" --overall 0.62 --version 0.5 --note "배지 3 구간"
//   node tools/office.mjs launch "0.5 클로즈베타"
//   node tools/office.mjs status | offduty | help
//
// 보고가 실패해도 0으로 끝난다(본 작업을 막지 않게). 경고만 출력한다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const AGENTS = {
  haram: 'PD', planner: '게임 기획', yoonseul: '생태 고증', sua: '시나리오', taeyun: '아트·UI',
  yejun: '아키텍트', coder: '개발자', qa: 'QA', reviewer: '리뷰어',
};
const ALIAS = { pd: 'haram', lead: 'haram', designer: 'planner', eco: 'yoonseul', story: 'sua', art: 'taeyun', ui: 'taeyun', arch: 'yejun', dev: 'coder', claude: 'coder', test: 'qa', review: 'reviewer' };
const STATIONS = ['plan', 'dev', 'test', 'review', 'ship', 'lounge'];
const BRANCH = process.env.OFFICE_BRANCH || 'office-status';
const REMOTE = process.env.OFFICE_REMOTE || 'origin';

function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2), v = argv[i + 1];
    if (['waiting', 'blocked', 'failed', 'done', 'idle', 'remove', 'no-push', 'quiet'].includes(k)) out[k] = true;
    else { out[k] = v; i++; }
  }
  return out;
}
const args = parse(process.argv.slice(2));
const cmd = args._[0] || 'help';
const warn = (m) => { if (!args.quiet) console.error('⚠️ 오피스 보고: ' + m); };

let ROOT;
const git = (a, opt = {}) => execFileSync('git', a, { cwd: ROOT, encoding: opt.buf ? null : 'utf8', input: opt.input, stdio: ['pipe', 'pipe', 'pipe'], timeout: opt.timeout || 20000, env: { ...process.env, ...opt.env } });
const tryGit = (a, opt) => { try { return git(a, opt); } catch { return null; } };

function base() {
  tryGit(['fetch', '-q', REMOTE, `+refs/heads/${BRANCH}:refs/remotes/${REMOTE}/${BRANCH}`], { timeout: 30000 });
  return (tryGit(['rev-parse', '-q', '--verify', `refs/remotes/${REMOTE}/${BRANCH}^{commit}`]) || tryGit(['rev-parse', '-q', '--verify', `refs/heads/${BRANCH}^{commit}`]) || '').trim() || null;
}
function readState(b) {
  if (!b) return {};
  try { return JSON.parse(git(['show', `${b}:status.json`])); } catch { return {}; }
}
function lsTree(spec) {
  const out = tryGit(['ls-tree', spec]); if (!out) return [];
  return out.split('\n').filter(Boolean).map((l) => { const [meta, name] = l.split('\t'); const [mode, type, sha] = meta.split(' '); return { mode, type, sha, name }; });
}
const mktree = (entries) => git(['mktree'], { input: entries.map((e) => `${e.mode} ${e.type} ${e.sha}\t${e.name}\n`).join('') }).trim();
const blob = (data) => git(['hash-object', '-w', '--stdin'], { input: data }).trim();

function agentId(x) {
  const k = String(x || '').toLowerCase();
  if (AGENTS[k]) return k; if (ALIAS[k]) return ALIAS[k];
  return k.replace(/[^a-z0-9-]/g, '').slice(0, 24) || null;
}
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function apply(st, now) {
  st.schema = 2; st.updated = new Date(now).toISOString(); st.updatedAt = now;
  st.agents ||= []; st.chat ||= []; st.log ||= [];
  if (args.overall != null) { const p = Number(args.overall); st.progress = p > 1 ? p / 100 : p; }
  if (args.version) st.version = clip(args.version, 20);
  if (args.note) st.note = clip(args.note, 80);
  const id = agentId(args.agent);
  let summary = 'update';
  const touches = ['station', 'task', 'progress', 'waiting', 'blocked', 'failed', 'done', 'idle', 'remove'].some((k) => args[k] != null);
  if (id && cmd === 'report' && touches) {
    const i = st.agents.findIndex((a) => a.id === id);
    if (args.remove) { if (i >= 0) st.agents.splice(i, 1); summary = `${id} 퇴근`; }
    else {
      const a = i >= 0 ? st.agents[i] : { id };
      const status = args.done ? 'done' : args.failed ? 'failed' : args.blocked ? 'blocked' : args.waiting ? 'waiting' : args.idle ? 'idle' : (args.station || args.task || args.progress) ? 'working' : a.status || 'working';
      a.status = status; a.at = now;
      if (args.station) a.station = STATIONS.includes(args.station) ? args.station : ({ ci: 'test', qa: 'test', deploy: 'ship', release: 'ship', pr: 'review', design: 'plan' }[args.station] || 'dev');
      if (args.done && !args.station) a.station = 'ship';
      if (args.task) a.task = clip(args.task, 80);
      if (args.progress != null) { const p = Number(args.progress); a.progress = Math.max(0, Math.min(1, p > 1 ? p / 100 : p)); }
      if (status === 'done') a.progress = 1;
      if (i < 0) st.agents.push(a);
      summary = `${id} ${status}${a.task ? ' · ' + a.task : ''}`;
    }
  }
  if (args.say) {
    st.chat.push({ id: `${now}-${Math.random().toString(36).slice(2, 6)}`, at: now, from: id || 'haram', to: args.to ? (agentId(args.to) || args.to) : 'all', text: clip(args.say, 120) });
    st.chat = st.chat.slice(-40); summary = `${id || 'haram'} → ${args.to || '모두'}: ${clip(args.say, 40)}`;
  }
  if (args.log) { st.log.push({ at: now, agent: id || null, text: clip(args.log, 100) }); st.log = st.log.slice(-30); }
  if (cmd === 'launch') { const name = clip(args._.slice(1).join(' ') || args.name || '새 버전', 40); st.launch = { id: String(now), at: now, name }; st.log.push({ at: now, agent: 'haram', text: `🚀 ${name} 런칭` }); summary = `launch ${name}`; }
  if (cmd === 'offduty') { st.agents = []; summary = '모두 퇴근'; }
  // 30분 넘게 소식 없는 에이전트는 하루 지나면 지움
  st.agents = st.agents.filter((a) => now - (a.at || 0) < 24 * 3600e3);
  return summary;
}

function commit(summary, shotFile) {
  const now = Date.now();
  for (let tryNo = 0; tryNo < 3; tryNo++) {
    const b = base();
    const st = readState(b);
    const msg = apply(st, now);
    const top = b ? lsTree(b).filter((e) => e.name !== 'status.json' && e.name !== 'shots') : [];
    let shots = b ? lsTree(`${b}:shots`) : [];
    if (shotFile) {
      const ext = (path.extname(shotFile).toLowerCase().replace('.', '') || 'png').replace('jpeg', 'jpg');
      const name = `${agentId(args.agent) || 'shot'}-${now}.${ext}`;
      const sha = git(['hash-object', '-w', shotFile]).trim();
      shots.push({ mode: '100644', type: 'blob', sha, name });
      st.billboard ||= { items: [] };
      st.billboard.items.push({ id: String(now), label: clip(args['shot-label'] || '화면 캡처', 40), agent: agentId(args.agent), at: now, file: `shots/${name}` });
    }
    // 캡처는 최근 8장만 남김
    shots.sort((x, y) => x.name.localeCompare(y.name)); shots = shots.slice(-8);
    if (st.billboard?.items) { const keep = new Set(shots.map((x) => 'shots/' + x.name)); st.billboard.items = st.billboard.items.filter((x) => keep.has(x.file)).slice(-8); }
    const entries = [...top, { mode: '100644', type: 'blob', sha: blob(JSON.stringify(st, null, 2) + '\n'), name: 'status.json' }];
    if (shots.length) entries.push({ mode: '040000', type: 'tree', sha: mktree(shots), name: 'shots' });
    const tree = mktree(entries.sort((x, y) => x.name.localeCompare(y.name)));
    const env = tryGit(['config', 'user.name']) ? {} : { GIT_AUTHOR_NAME: 'office-bot', GIT_AUTHOR_EMAIL: 'office-bot@users.noreply.github.com', GIT_COMMITTER_NAME: 'office-bot', GIT_COMMITTER_EMAIL: 'office-bot@users.noreply.github.com' };
    const c = git(['commit-tree', tree, ...(b ? ['-p', b] : []), '-m', `office: ${msg || summary}`], { env }).trim();
    git(['update-ref', `refs/heads/${BRANCH}`, c]);
    if (args['no-push']) return msg;
    if (tryGit(['push', '-q', REMOTE, `${c}:refs/heads/${BRANCH}`], { timeout: 40000 }) !== null) return msg;
    warn(`푸시가 거절됐어요. 다시 시도해요 (${tryNo + 1}/3)`);
  }
  throw new Error('푸시하지 못했어요 (네트워크·권한 확인)');
}

function main() {
  if (cmd === 'help' || args.help) {
    console.log(`생태몬스터 AI 오피스 보고 도구 (가지: ${BRANCH})
  report --agent <id> [--station plan|dev|test|review|ship] [--task "한 줄"] [--progress 0~1]
         [--waiting|--blocked|--failed|--done|--idle|--remove] [--say "한 줄" --to <id>] [--log "한 줄"]
         [--shot <png> --shot-label "설명"] [--overall 0~1] [--version 0.5] [--note "한 줄"]
  launch "<이름>"   런칭 행사       status   지금 상태 보기       offduty   모두 퇴근
에이전트 id: ${Object.entries(AGENTS).map(([k, v]) => `${k}(${v})`).join(' · ')}`);
    return;
  }
  try { ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { warn('git 저장소 안에서 불러 주세요.'); return; }
  if (cmd === 'status') {
    const st = readState(base());
    if (!st.agents) { console.log(`아직 보고가 없어요 (가지 ${BRANCH}).`); return; }
    console.log(`갱신 ${st.updated || '-'} · 진행률 ${st.progress != null ? Math.round(st.progress * 100) + '%' : '-'}${st.note ? ' · ' + st.note : ''}`);
    for (const a of st.agents) console.log(`- ${a.id}(${AGENTS[a.id] || '?'}) ${a.status} @${a.station || '-'} ${a.task || ''}${a.progress != null ? ` [${Math.round(a.progress * 100)}%]` : ''}`);
    return;
  }
  if (!['report', 'launch', 'offduty'].includes(cmd)) { warn(`모르는 명령: ${cmd} (help 참고)`); return; }
  if (cmd === 'report' && !args.agent && !args.log && !args.say && args.overall == null && !args.note) { warn('--agent 가 필요해요.'); return; }
  let shot = null;
  if (args.shot) {
    const f = path.resolve(args.shot);
    if (!fs.existsSync(f) || !/\.(png|jpe?g|webp|gif)$/i.test(f) || fs.statSync(f).size > 8 * 1024 * 1024) warn('캡처는 8MB 이하 png·jpg·webp·gif 만 올려요. 캡처는 건너뛰어요.');
    else shot = f;
  }
  try { const m = commit(cmd, shot); if (!args.quiet) console.log(`📡 오피스에 보고했어요: ${m}`); }
  catch (e) { warn(e.message); }
}
main();
