> ARCHIVED — superseded by reminder-feature-asbuilt/AS-BUILT.md. Feature shipped; do not implement from this.

# IMPLEMENTATION CONTRACT — Reminder Schedule UI

**Read this as a contract, not a description.** The bugs we hit (collapsed sections,
unequal status buttons) came from re-authoring CSS off a prose description. This document
removes that freedom: each UI piece is paired with its **exact CSS** and **exact class
names**. Use them verbatim.

## Ground rules (non-negotiable)

1. **The mockup wins.** `Reminder Schedule.html` is the source of truth. If your build
   differs from it visually, the build is wrong — change the build, not the mockup.
2. **Use `reminder-editor.css` as a drop-in file.** Copy it into the app's styles and load
   it. Do **not** re-derive these styles into `globals.css` from memory. (If house style
   requires everything in `globals.css`, paste the file's contents **verbatim** — same
   selectors, same values.)
3. **Do not rename classes.** Use the class names in the CSS exactly:
   `rblock`, `rblock-head`, `rblock-body`, `sentence`, `tok`, `lands`, `presets`, `preset`,
   `preset-custom`, `swt`, `dchips`, `dchip`, `sendprev`, `tline`, `tev`, `tag`, `addsend`,
   `rcps`, `rcp`, `stbtns`. (Earlier build renamed `rblock`→`schedule-rule-block` and the
   styling drifted. Don't.)
4. **Do not invent new spacing, sizes, radii, or colors.** Every value you need is in the
   CSS. No new paddings, no new font-sizes, no new grid definitions.
5. **No height/`max-height` on blocks.** Block height is driven by content. A clamp here is
   what collapsed the sections.
6. **Don't restyle shared components** (status buttons, drawer chrome). Match existing.

---

## Piece-by-piece contract

Each row: the markup shape, the class, and the rule that styles it. CSS is quoted from
`reminder-editor.css` / `redesign.css` — these exact declarations.

### 1. Rule block (the toggle "moment")
Markup:
```jsx
<section className={`rblock${on ? ' on' : ''}`}>
  <div className="rblock-head">
    <button className={`swt${on ? ' on' : ''}`} role="switch" aria-checked={on} onClick={toggle} />
    <div className="txt"><b>{title}</b><span className="sub">{sub}</span></div>
  </div>
  {on ? <div className="rblock-body">{children}</div> : null}
</section>
```
CSS (verbatim):
```css
.rblock { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); overflow: hidden; transition: border-color .15s, box-shadow .15s; }
.rblock.on { border-color: #bcd9cf; box-shadow: 0 1px 0 #e7efe9 inset; }
.rblock-head { display: flex; align-items: flex-start; gap: 12px; padding: 13px 15px; }
.rblock-head .txt { flex: 1; min-width: 0; }
.rblock-head .txt b { display: block; font-size: 13.5px; font-weight: 700; }
.rblock-head .txt .sub { display: block; color: var(--muted); font-size: 12px; margin-top: 1px; }
.rblock-body { padding: 0 15px 14px 15px; display: grid; gap: 11px; }
```
> The `{on ? <body> : null}` and the `display:grid` body are the contract. No height clamp.

### 2. Toggle switch
```css
.swt { flex: 0 0 auto; width: 38px; height: 22px; border-radius: 999px; background: var(--line-strong); border: 0; position: relative; cursor: pointer; padding: 0; transition: background .15s; margin-top: 2px; }
.swt::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: left .15s; }
.swt.on { background: var(--teal); }
.swt.on::after { left: 18px; }
```
The same boolean drives `.swt.on` AND the `{on ? <body>}` render. One source of truth.

### 3. Sentence + highlighted token
```css
.sentence { font-size: 13.5px; line-height: 1.7; color: var(--ink-soft); }
.sentence .tok { display: inline-flex; align-items: baseline; gap: 4px; padding: 1px 8px; margin: 0 1px; border-radius: 7px; background: #eaf3ef; border: 1px solid #bcd9cf; color: var(--teal-dark); font-weight: 700; font-family: "Spline Sans Mono", ui-monospace, monospace; font-size: 12.5px; }
.sentence .lands { font-family: "Spline Sans Mono", ui-monospace, monospace; color: var(--ink); font-weight: 600; }
```

### 4. Lead-time presets + custom-add (the multi-value control)
```css
.presets { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.preset { border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 12px; font-weight: 600; color: var(--ink-soft); cursor: pointer; }
.preset:hover { border-color: var(--teal); }
.preset.on { background: var(--navy); border-color: var(--navy); color: #f3f1e8; }
.preset-custom { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 999px; padding: 3px 6px 3px 12px; background: #fff; }
.preset-custom input { width: 46px; border: 1px solid var(--line); border-radius: 7px; padding: 4px 6px; font: inherit; font-family: "Spline Sans Mono", ui-monospace, monospace; font-size: 12.5px; text-align: center; }
.preset-custom .addbtn { border: 0; background: var(--navy); color: #f3f1e8; border-radius: 7px; padding: 4px 10px; font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; }
```

### 5. Computed-date chips (removable)
```css
.dchips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dchip { display: inline-flex; align-items: center; gap: 6px; border-radius: 7px; padding: 3px 9px; font-family: "Spline Sans Mono", ui-monospace, monospace; font-size: 11.5px; font-weight: 600; }
.dchip.next { background: var(--amber-soft); color: var(--amber); }
.dchip.future { background: var(--stone-soft); color: var(--ink-soft); }
.dchip.past { background: transparent; border: 1px dashed var(--line-strong); color: var(--faint); }
.dchip.rm { padding-right: 5px; }
.dchip .dx { border: 0; background: transparent; cursor: pointer; font-size: 14px; line-height: 1; color: inherit; opacity: .5; padding: 0 2px; }
```

### 6. "What will actually send" preview panel
```css
.sendprev { border: 1px solid #bcd9cf; background: linear-gradient(180deg,#f4faf7,var(--panel)); border-radius: 12px; padding: 14px 16px; }
.sendprev h4 { margin: 0 0 3px; font-size: 12.5px; font-weight: 700; color: var(--teal-dark); display: flex; align-items: center; gap: 7px; }
.sendprev .sum { margin: 0 0 11px; font-size: 12px; color: var(--ink-soft); }
.tline { display: grid; gap: 0; }
.tev { display: grid; grid-template-columns: 64px 1fr auto; gap: 11px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line-soft); }
.tev:first-child { border-top: 0; }
.tev .d { font-family: "Spline Sans Mono", ui-monospace, monospace; font-size: 12px; font-weight: 600; }
.tev .tag { border-radius: 999px; padding: 2px 9px; font-size: 10px; font-weight: 700; }
.tev .tag.next { background: var(--amber-soft); color: var(--amber); }
.tev .tag.sched { background: var(--stone-soft); color: var(--muted); }
.tev .tag.sent { background: var(--green-soft); color: var(--teal-dark); }
.tev .tag.oneoff { background: var(--blue-soft); color: #2c5e8f; }
```
The merged/sorted rows come from `buildSchedule()` in the mockup — port it verbatim; it is
the spec for the date math.

### 7. Add-a-one-off row (inside the preview panel)
```css
.addsend { display: flex; align-items: center; gap: 8px; margin-top: 11px; padding-top: 11px; border-top: 1px dashed var(--line-strong); }
.addsend .ttl { font-size: 12px; font-weight: 600; color: var(--teal-dark); flex: 1; }
.addsend input[type="date"] { border: 1px solid var(--line); border-radius: 7px; padding: 5px 9px; font: inherit; font-size: 12px; font-family: "Spline Sans Mono", ui-monospace, monospace; color: var(--ink); background: #fff; }
.addsend .addbtn { border: 0; background: var(--navy); color: #f3f1e8; border-radius: 7px; padding: 6px 12px; font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; }
```

### 8. Status buttons (shared component — match, don't restyle)
Three equal columns; "Complete" must fill its column like the others.
```css
.stbtns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.stbtns label, .stbtns .complete-trigger { width: 100%; justify-self: stretch; /* + shared button styling */ }
```
Keep the modal overlay out of the `.stbtns` grid (portal it). See FIX_NOTE.md Bug A.

---

## Drawer ordering (top → bottom, one scrolling `drawer-body`)
1. "What will actually send" preview (with the `+ Add a one-off date` row inside it)
2. Rule block — "When the item becomes due"
3. Rule block — "Before the deadline" (lead-time chips)
4. Rule block — "Keep nudging until it's done" (cadence presets)
5. "Also copy the vessel" (recipient chips — always expanded)
6. Email instructions

---

## Review loop (how to stop drift)
For each state below, render it, screenshot it, and diff against the mockup. If it differs,
the fix is to adopt the mockup's class + CSS above — not to nudge your own values.
- [ ] Drawer open, default rules — matches mockup top.
- [ ] "Before the deadline" ON with 14/7/3 selected — three chips + three preview rows.
- [ ] "Keep nudging" ON — cadence presets + recurring date chips visible.
- [ ] A one-off added — appears in preview, sorted, blue "One-off" tag, removable.
- [ ] Status buttons — three equal widths.
- [ ] Every ON section shows its body (no bare bars).
