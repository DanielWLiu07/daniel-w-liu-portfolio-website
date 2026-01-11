export function CardCorners() {
  const cornerClass = "absolute w-5 h-5 border-gray-400"

  return (
    <>
      <div className={`${cornerClass} top-1.5 left-1.5 border-l-3 border-t-3`} />
      <div className={`${cornerClass} top-1.5 right-1.5 border-r-3 border-t-3`} />
      <div className={`${cornerClass} bottom-1.5 left-1.5 border-l-3 border-b-3`} />
      <div className={`${cornerClass} bottom-1.5 right-1.5 border-r-3 border-b-3`} />
    </>
  )
}
