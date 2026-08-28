import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cx } from '../cx';
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
  children: ReactNode;
}

export function AppShell({ brand, tagline, navItems, user, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>{brand}</span>
          {tagline && <span className={styles.brandTag}>{tagline}</span>}
        </div>

        <nav className={styles.nav} aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
          </div>
        )}
      </aside>

      <main className={styles.main}>
        <div className={styles.mainInner}>{children}</div>
      </main>
    </div>
  );
}
