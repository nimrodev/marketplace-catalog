import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cx } from '../cx';
import { Button } from '../primitives';
import styles from './AppShell.module.css';

export interface NavItem {
  to: string;
  label: string;
  icon?: ReactNode;
  /** react-router matches nested paths by default; set for a route that
   *  should only be "active" on an exact match (e.g. "/"). */
  end?: boolean;
}

export interface AppShellUser {
  displayName: string;
  roleLabel: string;
}

export interface AppShellProps {
  brand: string;
  tagline?: string;
  /** Role-aware slot — renders whatever list it's given, filtering is the caller's job. */
  navItems: NavItem[];
  user?: AppShellUser;
  onLogout?: () => void;
  children: ReactNode;
}

export function AppShell({ brand, tagline, navItems, user, onLogout, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandRow}>
          <Link className={styles.brand} to="/" onClick={() => setMenuOpen(false)}>
            <span className={styles.brandMark}>{brand}</span>
            {tagline && <span className={styles.brandTag}>{tagline}</span>}
          </Link>
          {/* CSS-only on desktop (display: none) — only interactive below the
              980px breakpoint where the nav becomes a collapsible dropdown. */}
          <button
            type="button"
            className={styles.menuToggle}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>

        <div className={cx(styles.collapsible, menuOpen && styles.collapsibleOpen)}>
          <nav className={styles.nav} aria-label="Primary">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => cx(styles.navLink, isActive && styles.navLinkActive)}
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>

          {user && (
            <div className={styles.foot}>
              <div className={styles.user}>
                <span className={styles.avatar} aria-hidden="true">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
                <div>
                  <div className={styles.userName}>{user.displayName}</div>
                  <div className={styles.userRole}>{user.roleLabel}</div>
                </div>
              </div>
              {onLogout && (
                <Button variant="ghost" onClick={onLogout}>
                  Log out
                </Button>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.mainInner}>{children}</div>
      </main>
    </div>
  );
}
