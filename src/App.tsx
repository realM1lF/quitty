import { Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Liste from './pages/Liste'
import Neu from './pages/Neu'
import Detail from './pages/Detail'
import Auswertung from './pages/Auswertung'
import Einstellungen from './pages/Einstellungen'
import Login from './pages/Login'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Liste />} />
        <Route path="neu" element={<Neu />} />
        <Route path="eintrag/:id" element={<Detail />} />
        <Route path="auswertung" element={<Auswertung />} />
        <Route path="einstellungen" element={<Einstellungen />} />
        <Route path="*" element={<Liste />} />
      </Route>
    </Routes>
  )
}
