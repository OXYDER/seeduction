/** Avatar rond : l'image du membre, ou son initiale si elle n'en a pas. */
export default function Avatar({ user, size = 64 }: { user?: { username?: string; avatarUrl?: string | null } | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.44) };
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt="" className="forum-avatar" style={{ ...style, objectFit: 'cover', background: 'var(--bg-panel)' }} />;
  }
  return <div className="forum-avatar" style={style}>{user?.username?.[0]?.toUpperCase() ?? '?'}</div>;
}
