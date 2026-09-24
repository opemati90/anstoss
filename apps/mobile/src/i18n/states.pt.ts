import type { StatesCopy } from './states'

export const statesPt: StatesCopy = {
  common: {
    offline: 'Estás offline. Verifica a tua ligação e tenta novamente.',
    unknownError: 'Algo correu mal.',
    retry: 'Tentar novamente',
  },
  home: {
    error: {
      title: 'Não foi possível carregar a tua semana',
      body: 'Verifica a ligação e puxa para baixo para tentar de novo.',
    },
    stale: 'A mostrar os últimos dados guardados. Puxa para baixo para atualizar.',
  },
  events: {
    empty: {
      title: 'Ainda sem eventos',
      body: 'Os treinos e os jogos aparecem aqui assim que o treinador os criar.',
      cta: 'Criar o primeiro evento',
    },
    error: {
      title: 'Não foi possível carregar os eventos',
      body: 'Desliza para atualizar ou tenta novamente.',
      retry: 'Tentar novamente',
    },
  },
  pending_requests: {
    empty: {
      title: 'Sem pedidos pendentes',
      body: 'Os novos pedidos de admissão aparecem aqui.',
    },
    error: {
      title: 'Não foi possível carregar os pedidos',
      body: 'Desliza para atualizar ou tenta novamente.',
      retry: 'Tentar novamente',
    },
  },
  admin_members: {
    empty: {
      title: 'Ainda sem sócios',
      body: 'Convida o primeiro sócio para começar.',
      cta: 'Convidar sócio',
    },
    error: {
      title: 'Não foi possível carregar os sócios',
      body: 'Desliza para atualizar ou tenta novamente.',
      hint: 'Verifica a ligação ou sai e volta a entrar.',
      retry: 'Tentar novamente',
    },
  },
  contributions: {
    empty: {
      title: 'Ainda sem quotas',
      body: 'Quando o teu clube configurar as quotas, aparecem aqui.',
    },
    error: {
      title: 'Não foi possível carregar as quotas',
      body: 'Desliza para atualizar ou tenta novamente.',
      retry: 'Tentar novamente',
    },
  },
  team_matches: {
    empty: {
      title: 'Nenhum jogo agendado',
      body: 'Os próximos jogos e os já realizados aparecem aqui.',
    },
    error: {
      title: 'Não foi possível carregar os jogos',
      body: 'Desliza para atualizar ou tenta novamente.',
      retry: 'Tentar novamente',
    },
    noTeam: {
      title: 'Nenhuma equipa selecionada',
      body: 'Junta-te ou seleciona uma equipa para ver os jogos.',
    },
  },
  transfers: {
    empty: {
      title: 'Sem anúncios de transferências',
      body: 'Os clubes publicam aqui jogadores disponíveis ou procurados.',
    },
    error: {
      title: 'Não foi possível carregar as transferências',
      body: 'Desliza para atualizar ou tenta novamente.',
      retry: 'Tentar novamente',
    },
  },
  dm: {
    empty: {
      title: 'Ainda sem conversas',
      body: 'Inicia uma mensagem direta a partir do perfil de um colega ou treinador.',
      cta: 'Iniciar conversa',
    },
    error: {
      title: 'Não foi possível carregar as mensagens',
      body: 'Desliza para atualizar ou tenta novamente.',
      retry: 'Tentar novamente',
    },
  },
  errors: {
    api: {
      title: 'Algo correu mal',
      network: 'Verifica a tua ligação e tenta novamente.',
      offline: 'Estás offline. Restabelece a ligação e tenta novamente.',
      timeout: 'O pedido demorou demasiado. Tenta novamente.',
      rateLimit: 'Demasiados pedidos. Aguarda um momento e tenta novamente.',
      session: 'A tua sessão expirou. Inicia sessão novamente.',
      permission: 'Não tens permissão para fazer isso.',
      unavailable: 'Serviço temporariamente indisponível. Tenta novamente dentro de momentos.',
      generic: 'Algo correu mal. Tenta novamente.',
    },
  },
}
