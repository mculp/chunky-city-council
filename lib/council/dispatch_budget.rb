# frozen_string_literal: true

module Council
  # Reuse Giraffe's conservative call reservations. The dispatcher owns the mutex and private checkpoint.
  class DispatchBudget
    class Journal
      attr_reader :state
      def initialize(state, persist) = (@state, @persist = state, persist)
      def checkpoint_entry(section, key, entry)
        state.fetch("runtime")[section] ||= {}
        state["runtime"][section][key] = entry
        @persist.call
      end
    end

    def initialize(state:, limits:, mutex:, persist:, clock:, deadline:, stopped:)
      @limits, @mutex, @clock, @deadline, @stopped = limits, mutex, clock, deadline, stopped
      @ledger = ::Giraffe::CallLedger.new(Journal.new(state, persist))
    end

    def wrap(runner, job)
      budget = self
      Object.new.tap do |wrapper|
        wrapper.define_singleton_method(:call) { |task| budget.call(runner, job, task) }
      end
    end

    def call(runner, job, task)
      reservation = @mutex.synchronize do
        raise Error, "dispatch admission window closed" if @clock.call >= @deadline || @stopped.call
        raise Error, "dispatch call limit reached" if @ledger.entries.size >= @limits.fetch("max_calls")
        cap = task.budget_usd
        raise Error, "invalid call budget" unless cap.is_a?(Numeric) && cap.finite? && cap.positive?
        raise Error, "dispatch budget exhausted" if @ledger.spent + cap > @limits.fetch("budget_usd")
        @ledger.reserve(job, task.step, cap)
      end
      result = runner.call(task)
      @mutex.synchronize { @ledger.finished(reservation, result.fetch("usage", {})) }
      result
    end
    # On failure/missing usage the full reservation survives. Never silently refund an ambiguous call.
  end
end
