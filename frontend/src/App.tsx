import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { DesignApp } from './design/DesignApp'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<DesignApp />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
