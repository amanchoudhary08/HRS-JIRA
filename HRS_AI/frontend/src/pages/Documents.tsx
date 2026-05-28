import React, { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Upload, Eye, Calendar, Tag } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { motion } from 'framer-motion'
import api from '../services/api'
import { Spinner, EmptyState, Modal, PageHeader } from '../components/ui'
import type { ProcessDocument } from '../types'

const CATS = ['All', 'SOP', 'RUNBOOK', 'POLICY', 'GUIDE', 'OTHER']

const CAT_CLR: Record<string, { bg: string; color: string; border: string }> = {
  SOP:     { bg: 'rgba(34,211,238,0.08)',   color: '#22d3ee',  border: 'rgba(34,211,238,0.2)' },
  RUNBOOK: { bg: 'rgba(16,185,129,0.08)',   color: '#10b981',  border: 'rgba(16,185,129,0.2)' },
  POLICY:  { bg: 'rgba(139,92,246,0.08)',   color: '#8b5cf6',  border: 'rgba(139,92,246,0.2)' },
  GUIDE:   { bg: 'rgba(245,158,11,0.08)',   color: '#f59e0b',  border: 'rgba(245,158,11,0.2)' },
  OTHER:   { bg: 'rgba(100,116,139,0.08)',  color: '#94a3b8',  border: 'rgba(100,116,139,0.2)' },
}

export default function DocumentsPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cat, setCat] = useState('All')
  const [previewDoc, setPreviewDoc] = useState<ProcessDocument | null>(null)
  const [uploading, setUploading] = useState(false)

  const { data: documents, isLoading } = useQuery<ProcessDocument[]>({ queryKey: ['documents'], queryFn: () => api.get('/documents').then(r => r.data) })

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', file.name.replace(/\.[^/.]+$/, ''))
      await api.post('/documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Uploaded')
    } catch { toast.error('Upload failed') } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (isLoading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>

  const all = documents ?? []
  const filtered = cat === 'All' ? all : all.filter(d => d.category === cat)

  return (
    <div>
      <PageHeader
        title="Documents"
        description={`${all.length} process documents`}
        action={
          <div>
            <input ref={fileInputRef} type="file" onChange={handleUpload} className="hidden" accept=".md,.txt,.pdf,.doc,.docx" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-arc text-xs disabled:opacity-50">
              <Upload size={12} /> {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        }
      />

      {/* category filter */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {CATS.map(c => {
          const clr = CAT_CLR[c]
          const isAll = c === 'All'
          return (
            <button key={c} onClick={() => setCat(c)}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${cat === c && isAll ? 'btn-arc py-1.5 px-3' : ''}`}
              style={cat === c && !isAll
                ? { background: clr.bg, color: clr.color, border: `1px solid ${clr.border}` }
                : cat !== c
                ? { background: 'rgba(255,255,255,0.03)', color: '#405070', border: '1px solid rgba(255,255,255,0.06)' }
                : {}}>
              {c}
              {c !== 'All' && <span className="ml-1.5 opacity-60">({all.filter(d => d.category === c).length})</span>}
            </button>
          )
        })}
      </div>

      {filtered.length === 0
        ? <EmptyState icon={FolderOpen} title="No documents" description={cat === 'All' ? 'Upload your first document.' : `No ${cat} documents.`} action={{ label: 'Upload', onClick: () => fileInputRef.current?.click() }} />
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map((doc, i) => {
              const clr = CAT_CLR[doc.category] ?? CAT_CLR.OTHER
              return (
                <motion.div key={doc.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="rounded-xl p-4 transition-all duration-150 hover:border-arc/20"
                  style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-start justify-between mb-2.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide"
                      style={{ background: clr.bg, color: clr.color, border: `1px solid ${clr.border}` }}>
                      {doc.category}
                    </span>
                    <span className="text-[10px] font-mono text-slate-600">v{doc.version}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-200 mb-1 line-clamp-2">{doc.title}</h3>
                  {doc.department && <p className="text-xs text-slate-500 mb-2">{doc.department}</p>}
                  {doc.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {doc.tags.slice(0, 3).map((tag, j) => (
                        <span key={j} className="flex items-center gap-0.5 text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>
                          <Tag size={8} />{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[10px] font-mono text-slate-600">
                      <Calendar size={9} />
                      {doc.updated_at ? format(new Date(doc.updated_at), 'MMM d, yyyy') : '—'}
                    </span>
                    <button onClick={() => setPreviewDoc(doc)}
                      className="flex items-center gap-1 text-[10px] font-bold transition-colors hover:underline"
                      style={{ color: '#22d3ee' }}>
                      <Eye size={11} /> Preview
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

      <Modal open={!!previewDoc} onClose={() => setPreviewDoc(null)} title={previewDoc?.title ?? 'Preview'} size="lg">
        <div className="max-h-96 overflow-y-auto">
          {previewDoc?.content
            ? <div className="markdown-body text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{previewDoc.content}</ReactMarkdown></div>
            : <p className="text-sm text-slate-500">No preview available.</p>}
        </div>
        {previewDoc?.file_url && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <a href={previewDoc.file_url} target="_blank" rel="noopener noreferrer"
              className="text-xs font-bold hover:underline" style={{ color: '#22d3ee' }}>
              Open original file →
            </a>
          </div>
        )}
      </Modal>
    </div>
  )
}
