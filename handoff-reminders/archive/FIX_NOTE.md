> ARCHIVED — superseded by reminder-feature-asbuilt/AS-BUILT.md. Feature shipped; do not implement from this.

# FIX NOTE — two visual bugs in the built Reminder Schedule

Two divergences from the mockup (`Reminder Schedule.html`). Both are small; paste the CSS
and apply the structural notes. Verify against the mockup, not against prose.

---

## Bug A — "Complete / Roll forward" button is narrower than the other two

**Where:** item detail page, the Update-status card (`.act-card .stbtns`).
**Symptom:** "In progress" and "Submitted" fill their columns; "Complete" hugs its text
with empty space to its right.

**Cause:** the three status controls are a 3-column grid
(`grid-template-columns: repeat(3, minmax(0, 1fr))`), but "Complete" is a different element
— a `<button class="complete-trigger">` rendered by `<CompleteItemModal>` — and it is **not
stretching to fill its column**, so it collapses to content width and sits left-aligned.

**Fix 1 — force the grid items to fill (do this regardless):**
```css
.act-card .stbtns label,
.act-card .stbtns .complete-trigger {
  width: 100%;
  justify-self: stretch;   /* a <button> grid item won't stretch on its own here */
}
```

**Fix 2 — keep the grid at exactly three children.** `<CompleteItemModal>` returns a
fragment whose first child is the trigger button and whose later children are the modal
scrim + dialog. When the modal opens those extra nodes become **siblings inside `.stbtns`**.
They must not occupy grid cells:
- Either render the overlay via a portal (`createPortal`) so only the trigger lives in the grid,
- or give the scrim/dialog `position: fixed` (they likely already are) AND confirm they are
  not counted as grid items — simplest is the portal.

**Accept when:** the three controls are pixel-equal in width whether the modal is open or
closed (compare to mockup `.stbtns` — `repeat(3, 1fr)`, each control `padding: 10px 8px`).

---

## Bug B — rule sections render as bare bars; bodies don't show when toggled ON

**Where:** the drawer's rule blocks ("When the item becomes due", "Before the deadline",
"Keep nudging until it's done", "Also copy the vessel").
**Symptom:** each block is a thin bar (toggle + title only). Even sections whose toggle is
**ON** (teal) show no sentence / no lead-time chips / no cadence presets, and the
always-on "Also copy the vessel" shows no recipient editor.

**This is the big one — it makes the whole feature look empty.** The JSX is correct
(`{checked ? <div className="schedule-rule-body">{children}</div> : null}`), so the body is
being **suppressed by CSS or clipped by a height constraint**, not by logic. Diagnose in
this order, fix whichever is true:

1. **A height/clip on the block.** `.schedule-rule-block` has `overflow: hidden`. Confirm
   nothing sets a fixed/`max-height` on `.schedule-rule-block` (or an ancestor row) that
   clamps it to the head's height. In the mockup the block has **no height constraint** —
   height is driven by content. Remove any `max-height` / `height` on the block.
2. **A `display:none` override.** Inspect computed style of `.schedule-rule-body` in the
   browser. It must be `display: grid`. Search the stylesheet for a second, later
   `.schedule-rule-body` (or a generic `section > div`) rule that wins and hides it.
3. **The toggle state not reaching the body.** Confirm `schedule.startActive` /
   `schedule.expirationActive` drive **both** the toggle's `is-on` class and the
   `checked ?` body render from the **same** value (they should — don't split them).

**Guaranteed-correct structure + CSS** (this is the contract — match it exactly):
```jsx
<section className={`schedule-rule-block${on ? ' is-on' : ''}`}>
  <div className="schedule-rule-head">
    <Toggle on={on} onClick={...} />
    <div className="txt"><h4>{title}</h4><p>{sub}</p></div>
  </div>
  {on ? <div className="schedule-rule-body">{children}</div> : null}
</section>
```
```css
.schedule-rule-block { border: 1px solid var(--line); border-radius: 12px;
  background: var(--panel); overflow: hidden; }   /* NO height / max-height */
.schedule-rule-block.is-on { border-color: #bcd9cf; box-shadow: inset 0 1px 0 #e7efe9; }
.schedule-rule-head { display: flex; align-items: flex-start; gap: 12px; padding: 13px 15px; }
.schedule-rule-body { display: grid; gap: 11px; padding: 0 15px 14px; }   /* must not be display:none */
```

**Accept when:** toggling a section ON reveals its body (sentence + chips/presets), and
"Also copy the vessel" always shows the recipient editor — matching the mockup's expanded
state.

---

## Bonus — "Email instructions" placement

The mockup keeps instructions inside the flow, not exiled to the very bottom as an orphaned
block. Match the mockup ordering: preview → the three rule blocks → "Also copy the vessel" →
instructions, all inside the same scrolling `drawer-body`.
