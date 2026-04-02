import { useState, useCallback } from 'react'
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '../store'
import type { AsyncThunk } from '@reduxjs/toolkit'
import toast from 'react-hot-toast'

export function useFormModal<T extends Record<string, unknown>>(
  initialValues: T,
  thunk: AsyncThunk<unknown, unknown, object>,
  successMessage = 'Created successfully'
) {
  const dispatch = useDispatch<AppDispatch>()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<T>(initialValues)
  const [submitting, setSubmitting] = useState(false)

  const field = useCallback(
    <K extends keyof T>(key: K, value: T[K]) =>
      setForm(prev => ({ ...prev, [key]: value })),
    []
  )

  const reset = useCallback(() => {
    setForm(initialValues)
    setOpen(false)
  }, [initialValues])

  const submit = useCallback(
    async (payload?: unknown) => {
      setSubmitting(true)
      try {
        await dispatch(thunk(payload ?? form)).unwrap()
        toast(successMessage)
        reset()
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setSubmitting(false)
      }
    },
    [dispatch, thunk, form, successMessage, reset]
  )

  return { open, setOpen, form, field, submitting, submit, reset }
}
