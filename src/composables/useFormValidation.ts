import { computed, nextTick, reactive, ref } from 'vue'

type FieldKey<T> = Extract<keyof T, string>
type Validator<T> = (value: T[FieldKey<T>], form: T) => string | null

export function useFormValidation<T extends object>(
  form: T,
  validators: Partial<Record<FieldKey<T>, Validator<T>>>,
) {
  const touched = reactive<Record<string, boolean>>({})
  const submitted = ref(false)
  const errors = computed(() => {
    const result: Partial<Record<FieldKey<T>, string | null>> = {}
    for (const field of Object.keys(validators) as FieldKey<T>[]) {
      const validator = validators[field]
      result[field] = validator ? validator(form[field], form) : null
    }
    return result
  })

  function touch(field: FieldKey<T>): void {
    touched[field] = true
  }

  function error(field: FieldKey<T>): string | undefined {
    return touched[field] || submitted.value ? errors.value[field] ?? undefined : undefined
  }

  function validate(): boolean {
    submitted.value = true
    const valid = !Object.values(errors.value).some(Boolean)
    if (!valid) {
      void nextTick(() => {
        const invalid = document.querySelector<HTMLElement>('[aria-invalid="true"]')
        const focusTarget = invalid?.matches('input, select, textarea, button, [tabindex]')
          ? invalid
          : invalid?.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]')
        focusTarget?.focus()
      })
    }
    return valid
  }

  function resetValidation(): void {
    submitted.value = false
    Object.keys(touched).forEach((field) => delete touched[field])
  }

  return { error, resetValidation, touch, validate }
}
