import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// import './index.css' // Optional global styles

// Default dayjs locale is English; App.tsx switches to zh-cn when the user selects Chinese.
import dayjs from 'dayjs'
import 'dayjs/locale/en'
dayjs.locale('en')

import { loader } from '@monaco-editor/react'
import { monaco } from './monacoSetup'
loader.config({ monaco })

// 全局注册透明主题，避免每个 Editor 组件 beforeMount 中重复定义
monaco.editor.defineTheme('transparent-dark', {
  base: 'vs-dark', inherit: true, rules: [],
  colors: { 'editor.background': '#00000000', 'editor.lineHighlightBackground': '#ffffff10', 'editorGutter.background': '#00000000', 'editorStickyScroll.background': '#1e1e1e', 'editorStickyScrollHover.background': '#2a2a2a' }
})
monaco.editor.defineTheme('transparent-light', {
  base: 'vs', inherit: true, rules: [],
  colors: { 'editor.background': '#00000000', 'editor.lineHighlightBackground': '#00000010', 'editorGutter.background': '#00000000', 'editorStickyScroll.background': '#ffffff', 'editorStickyScrollHover.background': '#f5f5f5' }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
