/**
 * Shared Tailwind class constants.
 * Replace className="old-css-class" with className={cx.cardBase}, etc.
 * Composed with template literals so variants can extend base strings.
 */

// ── Layout ──────────────────────────────────────────────────────────────────

export const shell = "min-h-screen bg-bg";

export const shellBody = "flex min-h-[calc(100vh-64px)]";

export const appSidebar =
  "w-[180px] shrink-0 bg-bg-card border-r border-border px-2 py-3 sticky top-0 h-[calc(100vh-64px)] overflow-y-auto flex flex-col";

export const nav =
  "min-h-16 flex justify-between items-center gap-4 px-[clamp(16px,5vw,64px)] py-3.5 bg-bg-nav border-b border-border";

export const brand = "font-extrabold text-xl text-brand no-underline";

export const navActions = "flex items-center gap-3 flex-wrap";

export const page =
  "w-[min(1120px,calc(100%-32px))] mx-auto py-8 pb-14 max-sm:w-[min(100%-24px,1120px)] max-sm:pt-[22px]";

export const pageSidebar =
  "flex-1 min-w-0 w-auto m-0 px-8 py-8 pb-14 max-w-none";

export const pageBackBar = "px-8 py-2.5 border-b border-border bg-bg shrink-0";

export const pageBackLink =
  "text-text-muted no-underline text-sm font-semibold hover:text-brand";

// ── Primitives ───────────────────────────────────────────────────────────────

export const card =
  "bg-bg-card border border-border rounded-lg p-[18px] shadow-card";

export const stack = "grid gap-3.5";

export const row = "flex gap-2.5 items-center flex-wrap";

export const toolbar = "flex justify-between items-end gap-4 mb-5 flex-wrap";

export const autoGrid =
  "grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4";

export const empty =
  "border border-dashed border-empty-border rounded-lg p-6 bg-bg-card text-text-muted";

// ── Buttons ──────────────────────────────────────────────────────────────────

export const btn =
  "border border-brand bg-brand text-white rounded-lg min-h-[42px] px-3.5 font-extrabold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed";

export const btnSecondary =
  "border border-brand bg-bg-card text-brand rounded-lg min-h-[42px] px-3.5 font-extrabold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed";

export const btnDanger =
  "border border-[#8b2f17] bg-[#8b2f17] text-white rounded-lg min-h-[42px] px-3.5 font-extrabold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed";

export const iconBtn =
  "min-h-[38px] min-w-[38px] px-2 inline-flex items-center justify-center";

// ── Form / Field ─────────────────────────────────────────────────────────────

export const field = "grid gap-1.5";

export const fieldLabel = "font-bold text-text-label text-[0.9rem]";

export const fieldInput =
  "w-full border border-border-input rounded-lg min-h-[42px] px-3 py-2.5 bg-bg-card text-text focus:outline-none focus:border-brand";

export const fieldTextarea =
  "w-full border border-border-input rounded-lg min-h-[92px] px-3 py-2.5 bg-bg-card text-text resize-y focus:outline-none focus:border-brand";

export const fieldSelect =
  "w-full border border-border-input rounded-lg min-h-[42px] px-3 py-2.5 bg-bg-card text-text focus:outline-none focus:border-brand";

export const passwordField = "relative";

export const passwordInput = "pr-12";

export const passwordToggle =
  "absolute top-1/2 right-1.5 -translate-y-1/2 w-[34px] h-[34px] grid place-items-center border border-transparent rounded-lg bg-transparent p-0 text-text-muted hover:border-border-input hover:bg-bg focus-visible:border-border-input focus-visible:bg-bg";

// ── Feedback ─────────────────────────────────────────────────────────────────

export const errorBox =
  "border-l-4 border-error-border bg-error-bg px-3 py-3 rounded-lg text-error-text";

export const successToast =
  "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[min(340px,calc(100%-32px))] grid gap-1.5 border border-success-border rounded-lg bg-bg-card text-brand p-[18px] text-center shadow-card";

// ── Pills / Priority ─────────────────────────────────────────────────────────

export const pill =
  "inline-flex items-center rounded-full px-2.5 py-1 bg-pill-bg text-pill-color text-[0.85rem] font-bold";

export const priorityHigh = "bg-[#ffe7df] text-[#8b2f17]";
export const priorityMedium = "bg-[#fff0c2] text-[#755610]";
export const priorityLow = "bg-[#e3f2f0] text-[#245f60]";

/** Returns the priority pill classes for a given priority string */
export function priorityClass(priority: string): string {
  if (priority === "high") return `${pill} ${priorityHigh}`;
  if (priority === "medium") return `${pill} ${priorityMedium}`;
  if (priority === "low") return `${pill} ${priorityLow}`;
  return pill;
}

// ── Search bar ────────────────────────────────────────────────────────────────

export const searchWrapper = "relative flex-1 max-w-[380px]";

export const searchInput =
  "w-full px-3 py-[7px] border border-border-input rounded-md bg-bg text-text text-sm outline-none transition-colors focus:border-brand";

export const searchDropdown =
  "popup-panel absolute top-[calc(100%+6px)] left-0 right-0 z-[200] max-h-[420px] overflow-y-auto";

export const searchEmpty = "popup-muted px-3.5 py-3.5 text-[0.85rem]";

export const searchGroup =
  "py-1 [&+&]:border-t [&+&]:border-[rgba(255,255,255,0.08)]";

export const searchGroupHeader =
  "popup-muted px-3.5 pt-1.5 pb-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em]";

export const searchItem =
  "popup-row flex items-center gap-2 w-full px-3.5 py-2 border-none text-left cursor-pointer text-sm transition-colors";

export const searchItemTitle =
  "flex-1 whitespace-nowrap overflow-hidden text-ellipsis";

export const searchHighlight =
  "bg-[#fef08a] text-[#713f12] px-px rounded-[2px]";

// ── Labels ────────────────────────────────────────────────────────────────────

export const labelChip =
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.72rem] font-semibold whitespace-nowrap leading-[1.5]";

export const labelChipRemove =
  "bg-transparent border-none cursor-pointer p-0 text-[0.85rem] leading-none opacity-70 inline-flex items-center hover:opacity-100";

export const labelPickerWrap = "relative";

export const labelPickerChips = "flex flex-wrap items-center gap-1.5";

export const labelPickerToggle =
  "bg-transparent border border-dashed border-border-input rounded-md px-2.5 py-[3px] text-[0.78rem] text-text-muted cursor-pointer transition-colors hover:border-brand hover:text-brand";

export const labelPickerDropdown =
  "popup-panel absolute top-[calc(100%+6px)] left-0 min-w-[180px] z-[150] max-h-[240px] overflow-y-auto";

export const labelPickerOption =
  "popup-row flex items-center gap-2 w-full px-3.5 py-2 border-none text-left cursor-pointer text-sm transition-colors";

export const labelDot = "w-2.5 h-2.5 rounded-full shrink-0";

// ── Modal ─────────────────────────────────────────────────────────────────────

export const modalBackdrop =
  "fixed inset-0 bg-black/80 grid place-items-center p-4 z-20";

export const modal =
  "w-[min(560px,100%)] max-h-[calc(100vh-32px)] overflow-auto bg-white rounded-xl px-8 py-7 shadow-modal";

// ── Drawer ────────────────────────────────────────────────────────────────────

export const drawerBackdrop = "fixed inset-0 bg-black/40 z-20";

export const drawer =
  "fixed top-0 right-0 bottom-0 w-[min(600px,100vw)] bg-bg-card shadow-drawer flex flex-col z-[21] overflow-hidden";

export const drawerHeader =
  "flex items-center justify-between px-6 py-[18px] border-b border-border shrink-0";

export const drawerBody = "flex-1 overflow-y-auto p-6 flex flex-col gap-5";

export const drawerSectionTitle =
  "text-[0.8rem] font-bold uppercase tracking-[0.06em] text-text-muted mb-3";

export const drawerDivider = "h-px bg-border my-1";

// ── Comments ──────────────────────────────────────────────────────────────────

export const commentList = "flex flex-col gap-3";

export const commentItem = "flex gap-2.5";

export const commentAvatar =
  "w-[30px] h-[30px] rounded-full bg-brand text-white text-[0.7rem] font-bold flex items-center justify-center shrink-0 uppercase";

export const commentBubble =
  "flex-1 bg-pill-bg rounded-lg px-3 py-2.5 relative";

export const commentMeta = "flex items-center gap-2 mb-1";

export const commentAuthor = "text-[0.82rem] font-bold";

export const commentTime = "text-[0.76rem] text-text-muted";

export const commentBody = "text-[0.9rem] m-0 whitespace-pre-wrap break-words";

export const commentActions = "flex gap-1.5 mt-1.5";

export const commentActionBtn =
  "bg-transparent border-none px-1.5 py-0.5 text-[0.76rem] text-text-muted rounded cursor-pointer hover:bg-border hover:text-text";

export const commentActionBtnDanger =
  "bg-transparent border-none px-1.5 py-0.5 text-[0.76rem] text-text-muted rounded cursor-pointer hover:bg-[#fee2e2] hover:text-[#b91c1c]";

export const commentForm = "flex flex-col gap-2";

export const commentFormTextarea =
  "w-full min-h-[72px] px-3 py-2.5 border border-border-input rounded-lg bg-bg-card text-text resize-y text-[0.9rem] focus:outline-none focus:border-brand";

// ── Auth page ─────────────────────────────────────────────────────────────────

export const authLayout =
  "min-h-screen grid grid-cols-[minmax(0,1fr)_minmax(320px,460px)] bg-bg max-[720px]:grid-cols-1";

export const authArt =
  "[background-image:linear-gradient(rgba(31,91,69,0.42),rgba(31,91,69,0.12)),url('https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=80')] bg-cover bg-center min-h-screen p-12 flex items-end text-white max-[720px]:min-h-[220px] max-[720px]:items-center max-[720px]:p-6";

export const authPanel = "grid place-items-center p-6 bg-bg";

export const authCard = "w-[min(100%,420px)]";

export const authDivider =
  "flex items-center gap-3 text-text-muted text-[0.85rem] before:flex-1 before:h-px before:bg-border after:flex-1 after:h-px after:bg-border";

export const pageTitle =
  "m-0 mb-1.5 text-[clamp(1.6rem,4vw,2.4rem)] leading-[1.1] text-text";

export const pageSubtitle = "m-0 text-text-muted";

// ── Board ─────────────────────────────────────────────────────────────────────

export const boardColumn =
  "grid content-start gap-3 rounded-lg p-2 transition-colors";

export const boardColumnDragOver =
  "grid content-start gap-3 rounded-lg p-2 transition-colors bg-pill-bg outline-dashed outline-2 outline-brand";

export const taskCard =
  "min-h-[182px] grid gap-3 content-start bg-bg-card border border-border rounded-lg p-[18px] shadow-card";

export const filters =
  "grid grid-cols-[repeat(2,minmax(160px,1fr))] gap-3 max-[720px]:grid-cols-1";

// ── Live badge ────────────────────────────────────────────────────────────────

export const liveBadge =
  "text-[0.78rem] font-bold px-2.5 py-1 rounded-full bg-pill-bg text-text-muted tracking-[0.02em] transition-colors whitespace-nowrap";

export const liveBadgeOn = "bg-[#d1fae5] text-[#065f46]";

// ── Pagination ────────────────────────────────────────────────────────────────

export const pagination = "flex items-center justify-center gap-3 mt-5";

export const paginationInfo =
  "text-[0.9rem] text-text-muted font-semibold min-w-[110px] text-center";

// ── Member avatars ────────────────────────────────────────────────────────────

export const memberAvatar =
  "w-[38px] h-[38px] rounded-full bg-brand text-white text-[0.82rem] font-extrabold flex items-center justify-center shrink-0 select-none";

export const memberAvatarSm =
  "w-7 h-7 text-[0.7rem] border-2 border-bg-card rounded-full bg-brand text-white font-extrabold flex items-center justify-center shrink-0 select-none";

export const memberAvatarOverflow =
  "w-7 h-7 text-[0.65rem] border-2 border-bg-card rounded-full bg-pill-bg text-text-muted font-extrabold flex items-center justify-center shrink-0 select-none";

export const avatarStack =
  "flex flex-row-reverse [&>*]:-ml-2 [&>*:last-child]:ml-0";

// ── Member list ───────────────────────────────────────────────────────────────

export const memberList = "list-none m-0 p-0 grid gap-0.5";

export const memberRow =
  "flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-bg-card border border-border hover:border-brand";

export const memberInfo = "flex flex-col gap-px flex-1 min-w-0";

export const memberName =
  "font-bold whitespace-nowrap overflow-hidden text-ellipsis";

// ── Tab bar ───────────────────────────────────────────────────────────────────

export const tabBar = "flex gap-1 border-b-2 border-border mb-5 mt-5";

export const tabBtn =
  "bg-transparent border-none px-[18px] py-2 font-bold text-[0.9rem] text-text-muted border-b-2 border-transparent -mb-0.5 rounded-t cursor-pointer transition-colors hover:text-text inline-flex items-center";

export const tabBtnActive =
  "bg-transparent border-none px-[18px] py-2 font-bold text-[0.9rem] text-brand border-b-2 border-brand -mb-0.5 rounded-t cursor-pointer inline-flex items-center";

// ── Sidebar buttons ───────────────────────────────────────────────────────────

export const sidebarDivider = "h-px bg-border my-1.5";

export const sidebarBtn =
  "bg-transparent border-none px-3 py-2 font-semibold text-sm text-text-muted rounded-md cursor-pointer text-left flex items-center transition-colors w-full hover:bg-pill-bg hover:text-text";

export const sidebarBtnActive =
  "bg-pill-bg border-none px-3 py-2 font-bold text-sm text-brand rounded-md cursor-pointer text-left flex items-center w-full";

// ── TypeIcon tooltip ──────────────────────────────────────────────────────────

export const typeIcon =
  "relative inline-flex items-center after:content-[attr(data-tooltip)] after:absolute after:bottom-[calc(100%+5px)] after:left-1/2 after:-translate-x-1/2 after:bg-[#1e2623] after:text-white after:text-[0.72rem] after:font-medium after:px-[7px] after:py-[3px] after:rounded after:whitespace-nowrap after:pointer-events-none after:opacity-0 hover:after:opacity-100";

// ── Project link ──────────────────────────────────────────────────────────────

export const projectLink = "text-inherit no-underline block min-h-[148px]";

// ── Mention highlight ────────────────────────────────────────────────────────

export const mention = "font-semibold text-[var(--color-brand)]";
