import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import ProjectLabels from './pages/ProjectLabels';
import ProjectAnnotation from './pages/ProjectAnnotation';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import CreateTask from './pages/CreateTask';
import Jobs from './pages/Jobs';
import Annotation from './pages/Annotation';
import Models from './pages/Models';
import Training from './pages/Training';
import Testing from './pages/Testing';
import Notifications from './pages/Notifications';
import Teams from './pages/Teams';

export default function App() {
  return (
    <Routes>
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/register" element={<Register />} />
      <Route path="/tasks/:taskId/jobs/:jobId" element={<Annotation />} />
      <Route element={<Layout />}>
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<Navigate to="overview" replace />} />
        <Route path="/projects/:id/overview" element={<ProjectDetail />} />
        <Route path="/projects/:id/label" element={<ProjectLabels />} />
        <Route path="/projects/:id/annotation" element={<ProjectAnnotation />} />
        <Route path="/projects/:id/train" element={<Training />} />
        <Route path="/projects/:id/model" element={<Models />} />
        <Route path="/projects/:id/test" element={<Testing />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/tasks/create" element={<CreateTask />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/jobs" element={<Jobs />} />
      </Route>
      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  );
}
