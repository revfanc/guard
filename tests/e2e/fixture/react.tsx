import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  createHashRouter,
  RouterProvider,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { createBackGuard, type BackAttempt, type BackGuard } from "@guard";

function Fixture(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const guard = useRef<BackGuard>();
  const attempt = useRef<BackAttempt>();
  const [attempts, setAttempts] = useState(0);
  const [routeChanges, setRouteChanges] = useState(0);
  const previousPath = useRef(location.pathname);
  const protectedPage = location.pathname === "/protected";

  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname;
      setRouteChanges((count) => count + 1);
    }
  }, [location.pathname]);

  useEffect(() => () => guard.current?.dispose(), []);

  async function enter(): Promise<void> {
    await navigate("/protected");
    guard.current = createBackGuard({
      onBack(value) {
        attempt.current = value;
        setAttempts((count) => count + 1);
      },
    });
  }

  return (
    <main>
      <h1 data-testid="page">{protectedPage ? "Protected" : "Origin"}</h1>
      {!protectedPage ? (
        <button data-testid="enter" onClick={() => void enter()}>Enter protected page</button>
      ) : (
        <>
          <button data-testid="back" onClick={() => void navigate(-1)}>navigate(-1)</button>
          <button data-testid="leave" onClick={() => attempt.current?.leave()}>Leave</button>
          <button data-testid="reset" onClick={() => attempt.current?.reset()}>Reset</button>
        </>
      )}
      <output data-testid="attempts">{attempts}</output>
      <output data-testid="route-changes">{routeChanges}</output>
    </main>
  );
}

export function mountReactFixture(mode: "browser" | "hash"): void {
  const routes = [{ path: "*", element: <Fixture /> }];
  const router = mode === "hash" ? createHashRouter(routes) : createBrowserRouter(routes);
  createRoot(document.querySelector("#app")!).render(<RouterProvider router={router} />);
}
