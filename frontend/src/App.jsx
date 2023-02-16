import { lazy, Suspense } from 'react'
import { Routes, Route} from "react-router-dom"
import Home from "./Home"

const Login = lazy(() => import("./Login"));
const Edit = lazy(() => import("./Edit"));

function App() {
  
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Suspense><Login /></Suspense>} />
      <Route path="/edit" element={<Suspense><Edit /></Suspense>} />
    </Routes>
  )
}

export default App
