/** Open a protected R2 document with the current user gesture (mobile-friendly).
 * The signed URL is requested only when someone actually opens the sheet.
 */
export async function openProtectedDocument(readUrl: () => Promise<string>): Promise<void> {
  const tab = window.open('about:blank','_blank')
  if (!tab) throw new Error('Permite ventanas emergentes para consultar la ficha técnica.')
  tab.opener = null
  try {
    const url = await readUrl()
    const destination = new URL(url)
    if (destination.protocol !== 'https:') throw new Error('El enlace temporal no es válido.')
    tab.location.replace(url)
  } catch (error) {
    tab.close()
    throw error
  }
}
