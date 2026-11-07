# frozen_string_literal: true

require "json"
require "net/http"
require "uri"

module Council
  # Controller-owned Linear reads/writes. Roles receive task data, never this client or its credentials.
  # Dispatch transitions only to working/review states; Done is retained solely for the legacy landing path.
  class Linear
    URL = URI("https://api.linear.app/graphql")

    def initialize(key: ENV.fetch("LINEAR_API_KEY") { raise Error, "LINEAR_API_KEY is required for Linear access" })
      @key = key
    end

    def comment(identifier, body)
      issue = issue(identifier)
      query("mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }",
            "input" => {"issueId" => issue["id"], "body" => body})
    end

    def done(identifier)
      issue = issue(identifier)
      state = issue.dig("team", "states", "nodes").first || raise(Error, "#{identifier}'s team has no completed state")
      query("mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }",
            "id" => issue["id"], "input" => {"stateId" => state["id"]})
      state["name"]
    end

    def context(identifier)
      query(<<~GRAPHQL, "id" => identifier).fetch("issue") || raise(Error, "Linear has no #{identifier}")
        query($id: String!) { issue(id: $id) { id identifier team { id key } project { id } } }
      GRAPHQL
    end

    def create(parent, request)
      input = request.merge("teamId" => parent.fetch("team").fetch("id"), "parentId" => parent.fetch("id"))
      input["projectId"] = parent["project"]["id"] if parent["project"]
      result = query("mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }", "input" => input).fetch("issueCreate")
      raise Error, "Linear did not confirm ticket creation" unless result["success"] && result["issue"]
      result.fetch("issue")
    end

    # Read only explicitly approved identifiers, never sweep a team's backlog into autonomous work.
    def dispatch_ticket(identifier)
      query(<<~GRAPHQL, "id" => identifier).fetch("issue") || raise(Error, "Linear has no #{identifier}")
        query($id: String!) { issue(id: $id) {
          id identifier title description url state { name type }
          team { states { nodes { id name type } } }
          inverseRelations(first: 100) { nodes { type issue { identifier state { type } } } pageInfo { hasNextPage } }
        } }
      GRAPHQL
    end

    def transition(issue, name)
      state = issue.fetch("team").fetch("states").fetch("nodes").find { |row| row["name"] == name }
      raise Error, "unsafe or missing dispatch state #{name}" unless state && %w[started unstarted].include?(state["type"])
      result = query("mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }",
        "id" => issue.fetch("id"), "input" => {"stateId" => state.fetch("id")})
      raise Error, "Linear did not confirm #{name}; inspect before retrying" unless result.dig("issueUpdate", "success")
    end

    private

    def issue(identifier)
      @issues ||= {}
      @issues[identifier] ||= query(<<~GRAPHQL, "id" => identifier).fetch("issue") || raise(Error, "Linear has no #{identifier}")
        query($id: String!) { issue(id: $id) { id team { states(filter: {type: {eq: "completed"}}) { nodes { id name } } } } }
      GRAPHQL
    end

    def query(text, variables)
      request = Net::HTTP::Post.new(URL, "Authorization" => @key, "Content-Type" => "application/json")
      request.body = JSON.generate("query" => text, "variables" => variables)
      response = Net::HTTP.start(URL.host, URL.port, use_ssl: true, open_timeout: 15, read_timeout: 30) { |http| http.request(request) }
      raise Error, "Linear request failed (HTTP #{response.code})" unless response.is_a?(Net::HTTPSuccess)
      document = JSON.parse(response.body)
      raise Error, "Linear refused the request: #{document['errors'].map { |e| e['message'] }.join('; ')}" if document["errors"]
      document.fetch("data")
    end
  end
end
