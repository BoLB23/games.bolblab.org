import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';

export function Layout() {
  const { user } = useAuth();
  return <><header><Link className="brand" to="/">Lantern <em>Library</em></Link><nav aria-label="Main navigation"><NavLink to="/">Games</NavLink>{user && <NavLink to="/profile">{user.display_name}</NavLink>}</nav></header><Outlet /><footer>Lantern Library · an independent game collection</footer></>;
}
