&lt;!DOCTYPE html&gt;

&lt;html lang="fr"&gt;

&lt;head&gt;

&lt;meta charset="UTF-8"&gt;

&lt;meta name="viewport" content="width=device-width, initial-scale=1.0"&gt;

&lt;title&gt;Alpha V1.9.35 - Annotations Sélectives&lt;/title&gt;

&lt;script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"&gt;&lt;/script&gt;

&lt;style&gt;

:root {

\--bg-color: #1a1a1a;

\--panel-color: #242424;

\--text-main: #e2e8f0;

\--text-muted: #94a3b8;

\--border-color: #334155;

\--light-square: #ebecd0;

\--dark-square: #779556;

\--sq-highlight: rgba(255, 255, 255, 0.3);

\--menu-bg: #2d3748;

\--monitor-bg: #111;

\--accent-blue: #3b82f6;

}

body {

font-family: 'Inter', system-ui, -apple-system, sans-serif;

background-color: var(--bg-color);

color: var(--text-main);

display: flex;

flex-direction: column;

align-items: center;

margin: 0;

padding: 10px;

min-height: 100vh;

user-select: none;

}

.main-layout {

display: flex;

gap: 20px;

max-width: 1100px;

width: 100%;

justify-content: center;

flex-wrap: wrap;

}

/\* Moniteur \*/

.game-monitor {

width: min(90vw, 480px);

background: var(--monitor-bg);

border: 1px solid var(--border-color);

border-radius: 8px;

padding: 15px;

margin-bottom: 15px;

box-sizing: border-box;

position: relative;

min-height: 100px;

}

.monitor-menu-trigger {

position: absolute;

top: 10px;

right: 10px;

cursor: pointer;

width: 32px;

height: 32px;

display: flex;

flex-direction: column;

justify-content: center;

align-items: center;

gap: 4px;

z-index: 10;

}

.burger-bar { height: 2px; width: 20px; background-color: var(--text-main); border-radius: 1px; }

.btn-create-rep-fixed {

position: absolute;

bottom: 10px;

right: 10px;

background: var(--accent-blue);

color: white;

border: none;

border-radius: 4px;

padding: 5px 10px;

font-size: 0.7rem;

font-weight: bold;

cursor: pointer;

z-index: 11;

}

.monitor-title { color: #ffffff; font-weight: bold; font-size: 1.05rem; margin-bottom: 6px; padding-right: 85px; line-height: 1.4; min-height: 1.4em; }

.monitor-pgn { font-family: 'Courier New', monospace; font-size: 0.85rem; color: var(--text-main); margin-bottom: 8px; min-height: 1em; word-break: break-all; }

.monitor-comment { font-size: 0.85rem; color: var(--text-muted); border-top: 1px solid #333; padding-top: 8px; font-style: italic; white-space: pre-wrap; }

/\* Échiquier \*/

#board {

display: grid;

grid-template-columns: repeat(8, 12.5%);

width: min(90vw, 480px);

height: min(90vw, 480px);

border: 1px solid var(--border-color);

position: relative;

}

.square { aspect-ratio: 1; display: flex; justify-content: center; align-items: center; position: relative; cursor: pointer; }

.light { background-color: var(--light-square); }

.dark { background-color: var(--dark-square); }

.highlight::after { content: ""; position: absolute; inset: 0; background-color: var(--sq-highlight); }

.piece { width: 90%; height: 90%; pointer-events: none; }

/\* Panneau Latéral \*/

.side-panel {

width: min(95vw, 420px);

background: var(--panel-color);

border-radius: 8px;

border: 1px solid var(--border-color);

height: 600px;

display: flex;

flex-direction: column;

overflow: hidden;

}

.panel-tabs { display: flex; border-bottom: 1px solid var(--border-color); background: #1e1e1e; }

.tab-btn { flex: 1; padding: 14px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; font-weight: bold; }

.tab-btn.active { color: var(--text-main); border-bottom: 2px solid var(--text-main); }

.panel-content { flex-grow: 1; overflow-y: auto; padding: 12px; }

/\* Arbre \*/

.tree-root { list-style: none; padding: 0; margin: 0; }

.tree-line { display: flex; flex-wrap: wrap; align-items: center; margin-bottom: 4px; }

.tree-node { position: relative; padding-left: 14px; }

.tree-node::before { content: ""; position: absolute; left: 0; top: 12px; width: 14px; border-top: 1px dashed var(--border-color); }

.tree-node::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; border-left: 1px dashed var(--border-color); }

.tree-node:last-child::after { height: 12px; }

.tree-toggle {

position: absolute; left: 3px; top: 4px; background: #111; border: 1px solid var(--border-color);

color: var(--text-muted); width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;

font-size: 9px; cursor: pointer; z-index: 5; border-radius: 2px;

}

.move-text {

padding: 1px 3px; cursor: pointer; font-size: 0.8rem;

display: inline-flex; align-items: center; gap: 3px; margin: 1px 0px;

border-radius: 3px;

}

.move-text.active { color: var(--accent-blue); font-weight: bold; background: rgba(59, 130, 246, 0.1); }

.move-text:hover:not(.active) { color: #fff; text-decoration: underline; }

.move-num { opacity: 0.5; font-size: 0.7rem; font-family: monospace; }

.annotation-tag { font-weight: 900; color: #fbbf24; margin-left: 1px; }

/\* Répertoire \*/

.rep-section { margin-bottom: 12px; }

.section-header {

padding: 10px; background: #1a1a1a; cursor: pointer; border: 1px solid var(--border-color);

font-size: 0.75rem; font-weight: 900; letter-spacing: 1px; color: var(--text-muted);

display: flex; justify-content: space-between; align-items: center; border-radius: 4px;

}

.section-content { display: none; margin-top: 8px; }

.section-content.open { display: block; }

.rep-item-wrapper { margin-bottom: 8px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); background: rgba(255,255,255,0.02); }

.rep-header { padding: 12px; display: flex; flex-direction: column; cursor: pointer; background: #2d3748; border-left: 4px solid transparent; transition: background 0.2s; position: relative; }

.rep-header.active { background: #3d495d; border-right: 4px solid var(--accent-blue); }

.sub-variants-container { padding: 8px; background: #1a1a1a; display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border-color); }

.sub-var-item {

font-size: 0.75rem; color: var(--text-main); cursor: pointer; padding: 10px; border-radius: 6px;

display: flex; align-items: center; gap: 8px; border: 1px solid var(--border-color);

background: #242424; transition: all 0.2s;

box-sizing: border-box;

}

.sub-var-item:hover { background: #2d3748; border-color: var(--text-muted); }

.sub-var-item.active { background: var(--accent-blue); color: white; border-color: transparent; }

.sub-var-item::before { content: "↪"; opacity: 0.5; font-size: 0.9rem; flex-shrink: 0; }

/\* Contrôles \*/

.board-controls { display: flex; gap: 10px; margin-top: 15px; width: min(90vw, 480px); }

.ctrl-btn { flex: 1; padding: 12px; background: #2d3748; color: white; border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; display: flex; justify-content: center; align-items: center; }

.ctrl-btn.danger { background: #ef4444; border-color: #7f1d1d; }

/\* Menus \*/

.ctx-menu { position: absolute; background: var(--menu-bg); border: 1px solid var(--border-color); border-radius: 10px; width: 220px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 9999; display: none; padding: 6px 0; }

.menu-item { padding: 10px 16px; font-size: 0.85rem; cursor: pointer; color: white; display: flex; justify-content: space-between; align-items: center; }

.menu-item:hover { background: rgba(255, 255, 255, 0.1); }

.menu-label { padding: 4px 16px; font-size: 0.7rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase; }

/\* Modales \*/

#modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: none; justify-content: center; align-items: center; z-index: 10000; }

.modal-box { background: var(--panel-color); padding: 25px; border-radius: 12px; width: 360px; border: 1px solid var(--border-color); }

.modal-box h3 { margin-top: 0; font-size: 1.1rem; }

.modal-body { margin-bottom: 20px; color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; }

.modal-actions { display: flex; gap: 10px; }

.color-selector { display: flex; gap: 10px; margin: 15px 0; }

.color-opt {

flex: 1; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;

cursor: pointer; text-align: center; font-size: 0.8rem; font-weight: bold;

}

.color-opt.active { background: var(--accent-blue); color: white; border-color: transparent; }

&lt;/style&gt;

&lt;/head&gt;

&lt;body onclick="hideMenus()"&gt;

&lt;div class="main-layout"&gt;

&lt;div class="board-area"&gt;

&lt;div class="game-monitor" id="monitor-box" oncontextmenu="handleRightClick(event, 'monitor')"&gt;

&lt;div class="monitor-menu-trigger" onclick="toggleMonitorMenu(event)"&gt;

&lt;div class="burger-bar"&gt;&lt;/div&gt;&lt;div class="burger-bar"&gt;&lt;/div&gt;&lt;div class="burger-bar"&gt;&lt;/div&gt;

&lt;/div&gt;

&lt;button class="btn-create-rep-fixed" onclick="event.stopPropagation(); openNewRepModal()"&gt;CRÉER RÉP.&lt;/button&gt;

&lt;div class="monitor-title" id="mon-title"&gt;Jeu Libre&lt;/div&gt;

&lt;div class="monitor-pgn" id="mon-pgn"&gt;&lt;/div&gt;

&lt;div class="monitor-comment" id="mon-comment"&gt;&lt;/div&gt;

&lt;/div&gt;

&lt;div id="board" oncontextmenu="handleRightClick(event, 'board')"&gt;&lt;/div&gt;

&lt;div id="ctx-menu" class="ctx-menu" onclick="event.stopPropagation()"&gt;

&lt;div class="menu-item opt-flip" onclick="flipBoard()"&gt;Retourner l'échiquier&lt;/div&gt;

&lt;div class="menu-item opt-rename-rep" style="display:none" onclick="openRenameRepModal()"&gt;Renommer le répertoire&lt;/div&gt;

&lt;div class="menu-item opt-name-var" style="display:none" onclick="openNameVarModal()"&gt;Nommer la variante&lt;/div&gt;

&lt;div class="menu-item opt-comment" onclick="openCommentModal()"&gt;Commenter&lt;/div&gt;

&lt;div class="menu-item opt-delete" style="color:#f87171" onclick="handleDeleteClick()"&gt;Supprimer&lt;/div&gt;

&lt;div style="height:1px; background:var(--border-color); margin:4px 0"&gt;&lt;/div&gt;

&lt;div class="menu-label"&gt;Annoter&lt;/div&gt;

&lt;div class="menu-item" onclick="selectSymbol('!!')"&gt;Brillant &lt;span&gt;!!&lt;/span&gt;&lt;/div&gt;

&lt;div class="menu-item" onclick="selectSymbol('!')"&gt;Bon coup &lt;span&gt;!&lt;/span&gt;&lt;/div&gt;

&lt;div class="menu-item" onclick="selectSymbol('\*')"&gt;Intéressant &lt;span&gt;\*&lt;/span&gt;&lt;/div&gt;

&lt;div class="menu-item" onclick="selectSymbol('!?')"&gt;Douteux &lt;span&gt;!?&lt;/span&gt;&lt;/div&gt;

&lt;div class="menu-item" onclick="selectSymbol('?')"&gt;Erreur &lt;span&gt;?&lt;/span&gt;&lt;/div&gt;

&lt;div class="menu-item" onclick="selectSymbol('??')"&gt;Gaffe &lt;span&gt;??&lt;/span&gt;&lt;/div&gt;

&lt;div class="menu-item" onclick="selectSymbol('')"&gt;Effacer l'annotation&lt;/div&gt;

&lt;/div&gt;

&lt;div class="board-controls"&gt;

&lt;button class="ctrl-btn" onclick="resetPosition()"&gt;⟲&lt;/button&gt;

&lt;button class="ctrl-btn" onclick="navBack()"&gt;←&lt;/button&gt;

&lt;button class="ctrl-btn" onclick="navForward()"&gt;→&lt;/button&gt;

&lt;/div&gt;

&lt;/div&gt;

&lt;div class="side-panel"&gt;

&lt;div class="panel-tabs"&gt;

&lt;button class="tab-btn active" id="tab-repertoire" onclick="setTab('repertoire')"&gt;RÉPERTOIRES&lt;/button&gt;

&lt;button class="tab-btn" id="tab-arbre" onclick="setTab('arbre')"&gt;ARBRE&lt;/button&gt;

&lt;/div&gt;

&lt;div class="panel-content" id="tree-container"&gt;&lt;/div&gt;

&lt;/div&gt;

&lt;/div&gt;

&lt;div id="modal-overlay" onclick="closeModals()"&gt;

&lt;div class="modal-box" onclick="event.stopPropagation()" id="modal-new-rep" style="display:none"&gt;

&lt;h3 id="modal-rep-title"&gt;Nouveau Répertoire&lt;/h3&gt;

&lt;div id="color-sel-container"&gt;

&lt;div class="color-selector"&gt;

&lt;div class="color-opt active" id="opt-white" onclick="selectCol('w')"&gt;BLANCS&lt;/div&gt;

&lt;div class="color-opt" id="opt-black" onclick="selectCol('b')"&gt;NOIRS&lt;/div&gt;

&lt;/div&gt;

&lt;/div&gt;

&lt;input type="text" id="rep-name-input" placeholder="Ex: Gambit Dame" style="width:100%; padding:12px; background:#111; color:white; border:1px solid #333; border-radius:6px; box-sizing:border-box;"&gt;

&lt;button class="ctrl-btn" id="btn-rep-confirm" style="width:100%; margin-top:20px;" onclick="createNewRepertoire()"&gt;Créer&lt;/button&gt;

&lt;/div&gt;

&lt;div class="modal-box" onclick="event.stopPropagation()" id="modal-name-var" style="display:none"&gt;

&lt;h3&gt;Nommer la variante&lt;/h3&gt;

&lt;input type="text" id="var-name-input" placeholder="Ex: Variante d'échange" style="width:100%; padding:12px; background:#111; color:white; border:1px solid #333; border-radius:6px; box-sizing:border-box;"&gt;

&lt;button class="ctrl-btn" style="width:100%; margin-top:20px;" onclick="confirmNameVar()"&gt;Enregistrer&lt;/button&gt;

&lt;/div&gt;

&lt;div class="modal-box" onclick="event.stopPropagation()" id="modal-comment" style="display:none"&gt;

&lt;h3&gt;Commenter&lt;/h3&gt;

&lt;textarea id="comment-input" style="width:100%; height:100px; background:#111; color:white; border:1px solid #333; padding:12px; border-radius:6px; box-sizing:border-box;"&gt;&lt;/textarea&gt;

&lt;button class="ctrl-btn" style="width:100%; margin-top:10px;" onclick="confirmComment()"&gt;Enregistrer&lt;/button&gt;

&lt;/div&gt;

&lt;div class="modal-box" onclick="event.stopPropagation()" id="modal-confirm-delete" style="display:none"&gt;

&lt;h3&gt;Confirmer la suppression&lt;/h3&gt;

&lt;div class="modal-body" id="delete-msg"&gt;&lt;/div&gt;

&lt;div class="modal-actions"&gt;

&lt;button class="ctrl-btn" onclick="closeModals()"&gt;Annuler&lt;/button&gt;

&lt;button class="ctrl-btn danger" onclick="confirmDelete()"&gt;Supprimer&lt;/button&gt;

&lt;/div&gt;

&lt;/div&gt;

&lt;/div&gt;

&lt;script&gt;

const chess = new Chess();

const boardEl = document.getElementById('board');

const treeContainer = document.getElementById('tree-container');

let repertoires = \[\];

let activeRepIndex = -1;

let currentTab = 'repertoire', selectedSq = null, menuTarget = null, redoStack = \[\], boardFlipped = false;

let treeExpanded = new Set();

let selectedColor = 'w';

let contextMenuSource = ''; // 'repertoire' ou 'arbre'

let sectionStates = { white: true, black: true };

let freePlayRoot = { id: 'free', fen: chess.fen(), children: \[\], parent: null, moveNum: 0, turn: 'b', san: 'Initial' };

let currentNode = freePlayRoot;

function normalizeFen(f) { return f.split(' ')\[0\]; }

function selectCol(c) {

selectedColor = c;

document.getElementById('opt-white').classList.toggle('active', c === 'w');

document.getElementById('opt-black').classList.toggle('active', c === 'b');

}

function expandPathToNode(node) {

let temp = node;

while (temp && temp.parent) { treeExpanded.add(temp.parent.id); temp = temp.parent; }

}

function createNewRepertoire(config = null) {

const name = config ? config.name : document.getElementById('rep-name-input').value.trim();

const color = config ? config.color : selectedColor;

if (!name) return;

const newRep = {

id: 'rep_' + Math.random().toString(36).substr(2, 9),

name: name,

color: color,

san: 'Initial',

fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",

children: \[\],

parent: null,

moveNum: 0,

turn: 'b',

createdAt: Date.now(),

comment: "",

varName: "",

varAnnotation: ""

};

repertoires.push(newRep);

activeRepIndex = repertoires.length - 1;

boardFlipped = (color === 'b');

closeModals();

resetPosition();

return newRep;

}

function initExampleData() {

const repW = createNewRepertoire({ name: "Gambit Dame", color: 'w' });

activeRepIndex = repertoires.indexOf(repW);

let n1 = addMove(repW, "d4");

let n2 = addMove(n1, "d5");

let n3 = addMove(n2, "c4");

let nx = addMove(n3, "e6");

let nx2 = addMove(nx, "Nc3");

let nx3 = addMove(nx2, "Nf6");

let nExch = addMove(nx3, "cxd5");

nExch.varName = "Variante d'échange";

addMove(nExch, "exd5");

activeRepIndex = -1;

currentNode = freePlayRoot;

chess.reset();

render();

}

function openRenameRepModal() {

hideMenus();

const rep = repertoires\[activeRepIndex\];

document.getElementById('modal-overlay').style.display = 'flex';

document.getElementById('modal-new-rep').style.display = 'block';

document.getElementById('modal-rep-title').textContent = "Renommer Répertoire";

document.getElementById('color-sel-container').style.display = 'none';

document.getElementById('rep-name-input').value = rep.name;

document.getElementById('btn-rep-confirm').textContent = "Enregistrer";

document.getElementById('btn-rep-confirm').onclick = confirmRenameRep;

}

function confirmRenameRep() {

const name = document.getElementById('rep-name-input').value.trim();

if (name && activeRepIndex !== -1) repertoires\[activeRepIndex\].name = name;

closeModals(); render();

}

function findLastUniquePosition(node) {

let curr = node;

while (curr.children.length === 1) curr = curr.children\[0\];

return curr;

}

function openNameVarModal() {

hideMenus();

document.getElementById('modal-overlay').style.display = 'flex';

document.getElementById('modal-name-var').style.display = 'block';

document.getElementById('var-name-input').value = menuTarget.varName || "";

document.getElementById('var-name-input').focus();

}

function confirmNameVar() {

if (menuTarget) menuTarget.varName = document.getElementById('var-name-input').value.trim();

closeModals(); render();

}

function addMove(parent, san) {

if (!parent) return null;

const tmp = new Chess(parent.fen);

const m = tmp.move(san);

if (!m) return null;

const targetFen = tmp.fen();

let existing = parent.children.find(c => c.san === m.san);

if (existing) return existing;

const now = Date.now();

const transpo = activeRepIndex !== -1 ? findTranspositionInActiveRep(targetFen, now) : null;

const node = {

id: Math.random().toString(36).substr(2,9),

san: m.san,

fen: targetFen,

parent: parent,

children: \[\],

moveNum: tmp.turn() === 'w' ? parent.moveNum : parent.moveNum + 1,

turn: tmp.turn() === 'b' ? 'w' : 'b',

createdAt: now,

annotation: transpo ? transpo.annotation : "",

comment: transpo ? transpo.comment : "",

isTransposition: !!transpo,

sourceNode: transpo || null,

varName: "",

varAnnotation: ""

};

parent.children.push(node);

treeExpanded.add(parent.id);

return node;

}

function findTranspositionInActiveRep(fen, currentTime) {

if (activeRepIndex === -1) return null;

const target = normalizeFen(fen);

let found = null;

function search(node) {

if (found) return;

if (normalizeFen(node.fen) === target && node.createdAt < currentTime) { found = node; return; }

node.children.forEach(search);

}

search(repertoires\[activeRepIndex\]);

return found;

}

function render() {

updateMonitor();

renderBoard();

treeContainer.innerHTML = '';

if (currentTab === 'arbre') renderArbre();

else renderRepertoireList();

}

function renderBoard() {

boardEl.innerHTML = '';

const b = chess.board();

const h = chess.history({verbose:true});

const last = h\[h.length-1\];

for (let r = 0; r < 8; r++) {

for (let c = 0; c < 8; c++) {

const row = boardFlipped ? 7-r : r;

const col = boardFlipped ? 7-c : c;

const sq = String.fromCharCode(97+col) + (8-row);

const div = document.createElement('div');

div.className = \`square ${(r+c)%2===0?'light':'dark'}\`;

if (selectedSq === sq || (last && (last.from===sq || last.to===sq))) div.classList.add('highlight');

div.onclick = () => handleSquareClick(sq);

const p = b\[row\]\[col\];

if (p) {

const img = document.createElement('img');

img.className = 'piece';

img.src = \`https://upload.wikimedia.org/wikipedia/commons/${getPieceIcon(p)}\`;

div.appendChild(img);

}

boardEl.appendChild(div);

}

}

}

function handleSquareClick(sq) {

if (selectedSq === sq) selectedSq = null;

else if (selectedSq) {

const m = chess.move({from:selectedSq, to:sq, promotion:'q'});

if (m) {

chess.undo();

currentNode = addMove(currentNode, m.san);

chess.load(currentNode.fen);

redoStack = \[\]; selectedSq = null;

expandPathToNode(currentNode);

} else {

const p = chess.get(sq);

if (p && p.color === chess.turn()) selectedSq = sq;

else selectedSq = null;

}

} else {

const p = chess.get(sq);

if (p && p.color === chess.turn()) selectedSq = sq;

}

render();

}

function renderRepertoireList() {

if (repertoires.length === 0) {

treeContainer.innerHTML = '&lt;div style="text-align:center; color:var(--text-muted); padding:20px;"&gt;Utilisez le bouton "CRÉER RÉP." pour commencer.&lt;/div&gt;';

return;

}

const whites = repertoires.map((r, i) => ({r, i})).filter(x => x.r.color === 'w');

const blacks = repertoires.map((r, i) => ({r, i})).filter(x => x.r.color === 'b');

createSection("BLANCS", whites, 'white');

createSection("NOIRS", blacks, 'black');

}

function createSection(label, items, key) {

const sec = document.createElement('div');

sec.className = 'rep-section';

const head = document.createElement('div');

head.className = 'section-header';

head.innerHTML = \`&lt;span&gt;${label} (${items.length})&lt;/span&gt; &lt;span&gt;${sectionStates\[key\] ? '▼' : '▶'}&lt;/span&gt;\`;

head.onclick = () => { sectionStates\[key\] = !sectionStates\[key\]; render(); };

sec.appendChild(head);

const content = document.createElement('div');

content.className = \`section-content ${sectionStates\[key\] ? 'open' : ''}\`;

items.forEach(({r, i}) => {

const wrap = document.createElement('div');

wrap.className = 'rep-item-wrapper';

const rHead = document.createElement('div');

rHead.className = \`rep-header ${activeRepIndex === i ? 'active' : ''}\`;

rHead.innerHTML = \`&lt;b&gt;${r.name}${r.varAnnotation ? \` &lt;span class="annotation-tag"&gt;${r.varAnnotation}&lt;/span&gt;\` : ''}&lt;/b&gt;\`;

rHead.onclick = (e) => {

e.stopPropagation();

activeRepIndex = i;

currentNode = findLastUniquePosition(r);

expandPathToNode(currentNode);

chess.load(currentNode.fen);

boardFlipped = (r.color === 'b');

render();

};

rHead.oncontextmenu = (e) => handleRightClick(e, 'repertoire_item', r, i);

wrap.appendChild(rHead);

const subContainer = document.createElement('div');

subContainer.className = 'sub-variants-container';

function buildSubVarTree(node, depth = 0) {

node.children.forEach(c => {

if (c.varName) {

const item = document.createElement('div');

item.className = \`sub-var-item ${currentNode.id === c.id ? 'active' : ''}\`;

item.style.marginLeft = (depth \* 15) + "px";

item.innerHTML = \`${c.varName}${c.varAnnotation ? \` &lt;span class="annotation-tag"&gt;${c.varAnnotation}&lt;/span&gt;\` : ''}\`;

item.onclick = (e) => {

e.stopPropagation();

activeRepIndex = i;

currentNode = c;

expandPathToNode(c);

chess.load(currentNode.fen);

boardFlipped = (r.color === 'b');

render();

};

item.oncontextmenu = (e) => handleRightClick(e, 'repertoire_subitem', c);

subContainer.appendChild(item);

buildSubVarTree(c, depth + 1);

} else {

buildSubVarTree(c, depth);

}

});

}

buildSubVarTree(r);

if (subContainer.children.length > 0) wrap.appendChild(subContainer);

content.appendChild(wrap);

});

sec.appendChild(content);

treeContainer.appendChild(sec);

}

function renderArbre() {

if (activeRepIndex === -1) {

treeContainer.innerHTML = '&lt;div style="text-align:center; color:var(--text-muted); padding:20px;"&gt;Mode Jeu Libre. Sélectionnez un répertoire.&lt;/div&gt;';

return;

}

const rootUl = document.createElement('ul');

rootUl.className = 'tree-root';

const rootNode = repertoires\[activeRepIndex\];

function createMoveEl(node, hideNum = false) {

const el = document.createElement('div');

el.className = \`move-text ${currentNode.id === node.id ? 'active' : ''}\`;

let numStr = "";

if (!hideNum) {

numStr = \`&lt;span class="move-num"&gt;${node.turn === 'w' ? node.moveNum + '.' : node.moveNum + '...'}&lt;/span&gt;\`;

}

el.innerHTML = \`${numStr} ${node.san}${node.annotation ? \`&lt;span class="annotation-tag"&gt;${node.annotation}&lt;/span&gt;\` : ''}${node.isTransposition ? ' ↪' : ''}\`;

el.oncontextmenu = (e) => handleRightClick(e, 'arbre', node);

el.onclick = (e) => {

e.stopPropagation();

currentNode = (node.isTransposition && node.sourceNode) ? node.sourceNode : node;

chess.load(currentNode.fen);

render();

};

return el;

}

function walk(node, parentEl) {

if (node.children.length > 1 || node === rootNode) {

node.children.forEach(c => {

const li = document.createElement('li');

li.className = 'tree-node';

const line = document.createElement('div');

line.className = 'tree-line';

li.appendChild(line);

if (c.children.length > 0) {

const toggle = document.createElement('div');

toggle.className = 'tree-toggle';

toggle.textContent = treeExpanded.has(c.id) ? '−' : '+';

toggle.onclick = (e) => {

e.stopPropagation();

treeExpanded.has(c.id) ? treeExpanded.delete(c.id) : treeExpanded.add(c.id);

render();

};

li.appendChild(toggle);

}

line.appendChild(createMoveEl(c));

if (treeExpanded.has(c.id)) {

let currentChain = c;

while (currentChain.children.length === 1) {

const next = currentChain.children\[0\];

const shouldHideNum = (currentChain.turn === 'w' && next.turn === 'b');

line.appendChild(createMoveEl(next, shouldHideNum));

currentChain = next;

if (!treeExpanded.has(currentChain.id)) break;

}

if (currentChain.children.length > 1 && treeExpanded.has(currentChain.id)) {

const subUl = document.createElement('ul');

subUl.className = 'tree-root';

li.appendChild(subUl);

walk(currentChain, subUl);

}

}

parentEl.appendChild(li);

});

}

}

walk(rootNode, rootUl);

treeContainer.appendChild(rootUl);

}

let deleteTargetIdx = -1;

let pendingDeleteType = '';

function handleRightClick(e, type, target = null, index = -1) {

e.preventDefault(); e.stopPropagation();

menuTarget = target || currentNode;

deleteTargetIdx = index;

pendingDeleteType = type;

contextMenuSource = type;

const menu = document.getElementById('ctx-menu');

menu.style.display = 'block';

let x = e.pageX; let y = e.pageY;

if (x + 220 > window.innerWidth) x = window.innerWidth - 230;

menu.style.left = x + 'px'; menu.style.top = y + 'px';

const isRepRoot = (type === 'repertoire_item');

const isRepSub = (type === 'repertoire_subitem');

const isRepContext = isRepRoot || isRepSub;

menu.querySelector('.opt-rename-rep').style.display = isRepRoot ? 'block' : 'none';

menu.querySelector('.opt-delete').textContent = isRepRoot ? 'Supprimer le répertoire' : 'Supprimer ce coup';

const isNode = (type === 'monitor' || type === 'arbre' || isRepSub);

const isNotRoot = menuTarget && menuTarget.parent;

menu.querySelector('.opt-name-var').style.display = (isNode && isNotRoot) ? 'block' : 'none';

menu.querySelector('.opt-delete').style.display = (isRepRoot || (isNode && isNotRoot)) ? 'block' : 'none';

menu.querySelector('.opt-comment').style.display = (activeRepIndex !== -1) ? 'block' : 'none';

}

function countTotalChildren(node) {

let count = node.children.length;

node.children.forEach(c => count += countTotalChildren(c));

return count;

}

function handleDeleteClick() {

hideMenus();

if (deleteTargetIdx !== -1) {

const rep = repertoires\[deleteTargetIdx\];

const totalMoves = countTotalChildren(rep);

document.getElementById('delete-msg').innerHTML = \`Souhaitez-vous vraiment supprimer le répertoire &lt;b&gt;${rep.name}&lt;/b&gt; ainsi que les &lt;b&gt;${totalMoves}&lt;/b&gt; coups qui le suivent ?\`;

document.getElementById('modal-overlay').style.display = 'flex';

document.getElementById('modal-confirm-delete').style.display = 'block';

} else if (menuTarget && menuTarget.parent) {

const childrenCount = countTotalChildren(menuTarget);

if (childrenCount > 0) {

const moveLabel = (menuTarget.turn === 'w' ? menuTarget.moveNum + '.' : menuTarget.moveNum + '...') + ' ' + menuTarget.san;

document.getElementById('delete-msg').innerHTML = \`Voulez-vous effacer le coup &lt;b&gt;${moveLabel}&lt;/b&gt; ainsi que les &lt;b&gt;${childrenCount}&lt;/b&gt; coups qui le suivent ?\`;

document.getElementById('modal-overlay').style.display = 'flex';

document.getElementById('modal-confirm-delete').style.display = 'block';

} else {

confirmDelete();

}

}

}

function confirmDelete() {

if (deleteTargetIdx !== -1) {

repertoires.splice(deleteTargetIdx, 1);

if (activeRepIndex === deleteTargetIdx) { activeRepIndex = -1; currentNode = freePlayRoot; chess.reset(); }

else if (activeRepIndex > deleteTargetIdx) activeRepIndex--;

} else if (menuTarget && menuTarget.parent) {

const p = menuTarget.parent;

p.children = p.children.filter(c => c.id !== menuTarget.id);

if (currentNode.id === menuTarget.id || isDescendant(menuTarget, currentNode)) {

currentNode = p;

chess.load(p.fen);

}

}

closeModals();

deleteTargetIdx = -1;

render();

}

function isDescendant(parent, node) {

let temp = node;

while (temp) {

if (temp.id === parent.id) return true;

temp = temp.parent;

}

return false;

}

function toggleMonitorMenu(e) { e.stopPropagation(); handleRightClick(e, 'monitor'); }

function hideMenus() { document.getElementById('ctx-menu').style.display = 'none'; }

function closeModals() { document.getElementById('modal-overlay').style.display = 'none'; document.querySelectorAll('.modal-box').forEach(m => m.style.display = 'none'); }

function openNewRepModal() {

hideMenus(); document.getElementById('modal-overlay').style.display = 'flex';

document.getElementById('modal-new-rep').style.display = 'block';

document.getElementById('modal-rep-title').textContent = "Nouveau Répertoire";

document.getElementById('color-sel-container').style.display = 'block';

document.getElementById('rep-name-input').value = "";

document.getElementById('btn-rep-confirm').textContent = "Créer";

document.getElementById('btn-rep-confirm').onclick = createNewRepertoire;

selectCol('w');

}

function openCommentModal() { hideMenus(); document.getElementById('modal-overlay').style.display = 'flex'; document.getElementById('modal-comment').style.display = 'block'; document.getElementById('comment-input').value = menuTarget.comment || ''; }

function confirmComment() { if (menuTarget) menuTarget.comment = document.getElementById('comment-input').value; closeModals(); render(); }

function selectSymbol(s) {

if (menuTarget) {

if (contextMenuSource === 'repertoire_item' || contextMenuSource === 'repertoire_subitem') {

// Cible spécifiquement la variante dans l'onglet répertoire

menuTarget.varAnnotation = s;

} else {

// Cible le coup dans l'arbre ou le moniteur

menuTarget.annotation = s;

}

}

hideMenus(); render();

}

function updateMonitor() {

const titleEl = document.getElementById('mon-title');

const pgnEl = document.getElementById('mon-pgn');

const commEl = document.getElementById('mon-comment');

if (activeRepIndex === -1) { titleEl.textContent = "Jeu Libre"; pgnEl.textContent = getPathString(currentNode); commEl.style.display = 'none'; }

else {

let currentTitle = repertoires\[activeRepIndex\].name;

let temp = currentNode;

while(temp) { if(temp.varName) { currentTitle = temp.varName; break; } temp = temp.parent; }

titleEl.textContent = currentTitle; pgnEl.textContent = getPathString(currentNode);

commEl.textContent = currentNode.comment || "";

commEl.style.display = currentNode.comment ? 'block' : 'none';

}

}

function getPathString(node) {

if (!node) return "";

let p = \[\]; let t = node;

const root = activeRepIndex !== -1 ? repertoires\[activeRepIndex\] : freePlayRoot;

while(t && t !== root) { p.unshift(t); t = t.parent; }

return p.map(n => (n.turn==='w'?n.moveNum+'.':(p.indexOf(n)===0?n.moveNum+'...':'')) + n.san + (n.annotation||'')).join(' ');

}

function navBack() { if (currentNode.parent) { redoStack.push(currentNode); currentNode = currentNode.parent; chess.load(currentNode.fen); render(); } }

function navForward() { if (redoStack.length) { currentNode = redoStack.pop(); chess.load(currentNode.fen); render(); } }

function resetPosition() {

if (activeRepIndex !== -1) currentNode = repertoires\[activeRepIndex\];

else { freePlayRoot.children = \[\]; currentNode = freePlayRoot; }

chess.load(currentNode.fen); redoStack = \[\]; render();

}

function flipBoard() { boardFlipped = !boardFlipped; render(); }

function setTab(t) { currentTab = t; document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.id==='tab-'+t)); render(); }

function getPieceIcon(p) {

const map = {

'wp':'4/45/Chess_plt45.svg', 'wr':'7/72/Chess_rlt45.svg', 'wn':'7/70/Chess_nlt45.svg', 'wb':'b/b1/Chess_blt45.svg', 'wq':'1/15/Chess_qlt45.svg', 'wk':'4/42/Chess_klt45.svg',

'bp':'c/c7/Chess_pdt45.svg', 'br':'f/ff/Chess_rdt45.svg', 'bn':'e/ef/Chess_ndt45.svg', 'bb':'9/98/Chess_bdt45.svg', 'bq':'4/47/Chess_qdt45.svg', 'bk':'f/f0/Chess_kdt45.svg'

};

return map\[p.color + p.type\];

}

window.onload = function() { initExampleData(); render(); }

&lt;/script&gt;

&lt;/body&gt;

&lt;/html&gt;