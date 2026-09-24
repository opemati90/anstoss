import { Redirect } from 'expo-router'

/** Legacy route kept for old deep links; new chats start at /chat/new. */
export default function DmNewRedirect() {
  return <Redirect href={'/chat/new' as never} />
}
