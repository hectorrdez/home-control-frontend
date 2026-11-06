import Page from "@layouts/Page";
import { SiteMap } from "@pages/Routes";
import PathUtils from "@utils/PathUtils";
import { Navigate, Route, Routes } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route element={<Page />}>
        {PathUtils.generateRoutes(SiteMap)}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
