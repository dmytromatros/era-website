import Link from 'next/link'

export default function NotFound() {
  return (
    <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: 64, margin: 0 }}>404</h1>
        <p>This room of the site does not exist (yet).</p>
        <Link href="/">Back to the start</Link>
      </div>
    </main>
  )
}
